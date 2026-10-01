import test from 'node:test';import assert from 'node:assert/strict';
import twilio from 'twilio';
import {selectCaller,phoneCountry} from '../server/numbers.mjs';
import {paymentCredit} from '../server/billing.mjs';
import {billedCents,directPhone} from '../server/calls.mjs';
import {realtimeSession,signedStream} from '../server/voice.mjs';
import {createTwilio} from '../server/twilio.mjs';
test('caller selection prefers destination country and rejects unowned caller IDs',()=>{
 const numbers=[{phone:'+12166168630',country:'US'},{phone:'+442079460123',country:'GB'}];
 assert.equal(selectCaller(numbers,'+442079460222').country,'GB');assert.equal(selectCaller(numbers,'+6638253000').country,'US');
 assert.throws(()=>selectCaller(numbers,'+6638253000','+12025550100'));assert.equal(phoneCountry('+6638253000'),'TH');
});
test('payment credit verifies identity, currency and amount; refunds and disputes remove credit',()=>{
 const order={id:'order',checkout_id:'ch_test',cents:1000};
 const p={company:{id:'biz_5ta3KBWbyc9RMX'},checkout_configuration_id:'ch_test',metadata:{order_id:'order'},currency:'usd',subtotal:10,status:'paid'};
 assert.equal(paymentCredit(p,order),1000);assert.equal(paymentCredit({...p,refunded_amount:3},order),700);
 assert.equal(paymentCredit({...p,disputes:[{status:'under_review'}]},order),0);
 assert.throws(()=>paymentCredit({...p,currency:'eur'},order));assert.throws(()=>paymentCredit({...p,subtotal:9},order));assert.throws(()=>paymentCredit({...p,checkout_configuration_id:'ch_other'},order));
});
test('per-second billing cannot exceed the reserved limit',()=>{
 assert.equal(billedCents(1,60,300),1);assert.equal(billedCents(0,60,300),0);assert.equal(billedCents(1000,60,300),300);assert.equal(billedCents(7,65,300),8);
});
test('direct calls require a valid international number',()=>{
 assert.equal(directPhone('+12165551234'),'+12165551234');
 assert.equal(directPhone('+66812345678'),'+66812345678');
 assert.throws(()=>directPhone('2165551234'));
 assert.throws(()=>directPhone('+123'));
});
test('Twilio rejection retains its error code for a useful call result',async()=>{
 const client=createTwilio({accountSid:'AC'+'1'.repeat(32),authToken:'test',from:'+12165551234',voiceUrl:'https://example.com/voice',statusCallbackUrl:'https://example.com/status'},async()=>({ok:false,status:400,json:async()=>({code:21215,message:'Geo permission denied'})}));
 await assert.rejects(client.dial({to:'+66812345678',reservedCents:300,rateCentsPerMinute:60,commandId:'test-call'}),error=>error.status===400&&error.code===21215&&!error.message.includes('Geo permission denied'));
});
test('Twilio media handshake validates the signed WebSocket URL',()=>{
 const before={origin:process.env.PUBLIC_ORIGIN,token:process.env.TWILIO_AUTH_TOKEN};
 process.env.PUBLIC_ORIGIN='https://example.com';process.env.TWILIO_AUTH_TOKEN='test-token';
 try{
  const url='wss://example.com/api/voice/stream';
  const signature=twilio.getExpectedTwilioSignature('test-token',url,{});
  assert.equal(signedStream({url:'/api/voice/stream',headers:{'x-twilio-signature':signature}}),true);
  assert.equal(signedStream({url:'/api/voice/stream',headers:{'x-twilio-signature':'invalid'}}),false);
 }finally{if(before.origin===undefined)delete process.env.PUBLIC_ORIGIN;else process.env.PUBLIC_ORIGIN=before.origin;if(before.token===undefined)delete process.env.TWILIO_AUTH_TOKEN;else process.env.TWILIO_AUTH_TOKEN=before.token;}
});
test('voice session uses telephony audio and explicit AI disclosure',()=>{
 const s=realtimeSession({request:'Ask opening hours'}).session;assert.equal(s.audio.input.format.type,'audio/pcmu');assert.equal(s.audio.output.format.type,'audio/pcmu');assert.match(s.instructions,/Introduce yourself as an AI/);assert.match(s.instructions,/Do not invent/);
});

test('webhook rejects tampered and stale payloads and acknowledges unrelated valid events',async()=>{
 const {createHmac}=await import('node:crypto');
 const {whopWebhook}=await import('../server/billing.mjs');
 const secret='ws_test_only_secret_for_signature_validation';
 const prior=process.env.WHOP_WEBHOOK_SECRET;process.env.WHOP_WEBHOOK_SECRET=secret;
 try{
  const body=JSON.stringify({type:'unhandled.test',data:{}}),id='msg_test';
  const invoke=async(raw,seconds,signatureBody=raw)=>{
   const signature=createHmac('sha256',secret).update(`${id}.${seconds}.${signatureBody}`).digest('base64');
   let status;await whopWebhook({body:Buffer.from(raw),headers:{'webhook-id':id,'webhook-timestamp':String(seconds),'webhook-signature':`v1,${signature}`}},{sendStatus(code){status=code;return this;}});return status;
  };
  const now=Math.floor(Date.now()/1000);
  assert.equal(await invoke(body,now),200);
  assert.equal(await invoke(body+' ',now,body),400);
  assert.equal(await invoke(body,now-600),400);
 }finally{if(prior===undefined)delete process.env.WHOP_WEBHOOK_SECRET;else process.env.WHOP_WEBHOOK_SECRET=prior;}
});
