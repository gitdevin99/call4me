import {randomUUID} from 'node:crypto';
import {db,transaction,walletLock,dbConfigured} from './db.mjs';
import {ownedNumbers,selectCaller,twilioClient,phoneCountry} from './numbers.mjs';
import {parsePhoneNumberFromString} from 'libphonenumber-js';
import {createTwilio} from './twilio.mjs';
export const liveReady=()=>Boolean(dbConfigured()&&process.env.OPENAI_API_KEY&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.PUBLIC_ORIGIN&&process.env.CALLS_ENABLED==='true');
export const RATE=Number(process.env.CALL_RATE_CENTS_PER_MINUTE)||60;
export const terminal=status=>['completed','failed','busy','no-answer','canceled'].includes(status);
export async function callPlace(id) {
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw new Error('Select a Google Maps business.');
 const r=await fetch(`https://places.googleapis.com/v1/places/${id}`,{headers:{'X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':'id,displayName,internationalPhoneNumber'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Could not verify the business phone number.');
 const p=await r.json();const phone=p.internationalPhoneNumber?.replace(/[^+\d]/g,'');
 if(!phone||!phoneCountry(phone))throw new Error('This business has no supported phone number.');
 return {id:p.id,name:p.displayName.text,phone};
}
export function directPhone(value) {
 if(typeof value!=='string'||!/^\+[1-9]\d{6,14}$/.test(value))throw new Error('Enter a phone number with country code, such as +12165551234.');
 const parsed=parsePhoneNumberFromString(value);
 if(!parsed?.isValid())throw new Error('That phone number is not valid. Check the country code and digits.');
 return parsed.number;
}
export async function quote({placeId,destinationPhone,caller}) {
 if(Boolean(placeId)===Boolean(destinationPhone))throw new Error('Choose one business or phone number to call.');
 const place=placeId?await callPlace(placeId):{id:`direct:${directPhone(destinationPhone)}`,name:'Direct phone call',phone:directPhone(destinationPhone)};
 const numbers=await ownedNumbers();
 const selected=selectCaller(numbers,place.phone,caller);
 const price=await twilioClient().pricing.v2.voice.numbers(place.phone).fetch();
 if(price.priceUnit!=='USD'||!price.outboundCallPrices?.length)throw new Error('Pricing is unavailable for this destination.');
 const carrier=Math.max(...price.outboundCallPrices.map(p=>Number(p.currentPrice)));
 if(!Number.isFinite(carrier)||carrier<0||carrier>1)throw new Error('This destination is not supported for calling yet.');
 const rate=Math.max(RATE,Math.ceil((carrier*100+25)*1.5));
 return {place,caller:selected,numbers,rate,maxSeconds:600};
}
export async function placeCall(user,{threadId,placeId,destinationPhone,plan,caller,limit,quotedRate}) {
 if(!liveReady())throw new Error('Live calling is awaiting its connection test. No call was placed.');
 const q=await quote({placeId,destinationPhone,caller});
 if(q.rate!==quotedRate)throw new Error("The rate changed. Please review the call again.");
 const row=await transaction(async c=>{
  const w=await walletLock(c,user);
  const existing=(await c.query('select * from callapp.calls where user_id=$1 and thread_id=$2',[user,threadId])).rows[0];
  if(existing)return {...existing,existing:true};
  if(w.balance-w.reserved<limit)throw new Error('Reload your wallet to cover the spending limit.');
  if((await c.query("select 1 from callapp.calls where user_id=$1 and ended_at is null",[user])).rowCount)throw new Error('Finish your current call first.');
  const id=randomUUID();await c.query('update callapp.wallets set reserved=reserved+$2 where user_id=$1',[user,limit]);
  return (await c.query('insert into callapp.calls(id,user_id,thread_id,place_id,destination,caller,plan,reserved,rate) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[id,user,threadId,q.place.id,q.place.phone,q.caller.phone,{...plan,business:placeId?q.place.name:(plan.business||'Direct phone call'),direct:!placeId},limit,q.rate])).rows[0];
 });
 if(row.existing)return row;
 try {
  const result=await createTwilio({accountSid:process.env.TWILIO_ACCOUNT_SID,authToken:process.env.TWILIO_AUTH_TOKEN,from:row.caller,voiceUrl:`${process.env.PUBLIC_ORIGIN}/api/voice/start`,statusCallbackUrl:`${process.env.PUBLIC_ORIGIN}/api/voice/status`}).dial({to:row.destination,reservedCents:row.reserved,rateCentsPerMinute:row.rate,commandId:row.id});
  await db().query("update callapp.calls set sid=$2,status=case when status='dispatching' then $3 else status end where id=$1",[row.id,result.sid,result.status]);
  return {...row,sid:result.sid,status:result.status};
 }catch(e){
  if(e.status>=400&&e.status<500){
   await transaction(async c=>{const r=(await c.query('select * from callapp.calls where id=$1 for update',[row.id])).rows[0];if(r.ended_at)return;await walletLock(c,user);await c.query('update callapp.wallets set reserved=reserved-$2 where user_id=$1',[user,row.reserved]);await c.query("update callapp.calls set status='failed',cost=0,duration=0,ended_at=now(),summary='The carrier rejected the call. No credit was charged.' where id=$1",[row.id]);});
   throw new Error('The carrier rejected this call. Your credit has been released. Check the destination country permissions.');
  }
  // A network timeout may still have placed the call. Keep the hold for callback/reconciliation.
  await db().query("update callapp.calls set status='dispatch-unknown',summary=$2 where id=$1 and sid is null",[row.id,'The provider did not confirm dialing. Credit remains reserved until reconciliation.']);
  throw new Error('The provider did not confirm dialing. Do not retry; we are checking the call status.');
 }
}
export function billedCents(seconds,rate,limit){return Math.min(limit,Math.ceil(seconds*rate/60));}
export async function reconcileCall(id,sid,fetchCall=()=>twilioClient().calls(sid).fetch()) {
 const actual=await fetchCall();
 await transaction(async c=>{
  const row=(await c.query('select * from callapp.calls where id=$1 for update',[id])).rows[0];
  if(!row||row.ended_at||row.sid&&row.sid!==sid)return;
  if(actual.to!==row.destination||actual.from!==row.caller)throw new Error('Call identity mismatch.');
  if(!terminal(actual.status)){await c.query('update callapp.calls set sid=$2,status=$3 where id=$1',[id,sid,actual.status]);return;}
  const duration=Math.max(0,Number(actual.duration)||0), cost=billedCents(duration,row.rate,row.reserved);
  await walletLock(c,row.user_id);
  await c.query('update callapp.wallets set reserved=reserved-$2,balance=balance-$3 where user_id=$1',[row.user_id,row.reserved,cost]);
  await c.query('update callapp.calls set sid=$2,status=$3,duration=$4,cost=$5,ended_at=now() where id=$1',[id,sid,actual.status,duration,cost]);
  await c.query('insert into callapp.ledger(user_id,reference,title,cents,type) values($1,$2,$3,$4,$5) on conflict(reference) do nothing',[row.user_id,id,row.plan.business,-cost,'call']);
 });
}
export function startCallReconciliation() {
 let running=false;
 const timer=setInterval(async()=>{
  if(running||!dbConfigured())return;running=true;
  try{const rows=(await db().query("select id,sid from callapp.calls where ended_at is null and sid is not null order by created_at limit 100")).rows;for(const row of rows){try{await reconcileCall(row.id,row.sid);}catch{console.error('Call reconciliation pending',row.id);}}}catch{console.error('Call reconciliation database unavailable');}finally{running=false;}
 },30000);timer.unref();return timer;
}
