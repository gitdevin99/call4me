import {recall,memoryProfile,updateMemory,remember,memoryConfigured} from './memory.mjs';
import {randomUUID} from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {db,dbConfigured} from './db.mjs';
import {ownedNumbers,numberCatalog,twilioClient,availableCountries} from './numbers.mjs';
import {checkout} from './billing.mjs';
import {quote,placeCall,reconcileCall,terminal} from './calls.mjs';
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(400).json({error:e instanceof z.ZodError?'Please check the call details.':e.message});}};
export function accountRouter(supabase){
 const r=Router();
 r.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 r.use(async(req,res,next)=>{try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token||!supabase)return res.status(401).json({error:'Sign in to continue.'});const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:'Please sign in again.'});req.user=data.user;next();}catch{res.status(503).json({error:'Authentication is unavailable.'});}});
 r.get('/memory',wrap(async(req,res)=>res.json(await memoryProfile(req.user.id))));
 r.post('/memory',wrap(async(req,res)=>{
  if(!memoryConfigured())return res.status(503).json({error:'Memory is not connected yet.'});
  const input=z.object({enabled:z.boolean().optional(),reset:z.boolean().optional(),correction:z.string().min(1).max(2000).optional()}).parse(req.body);
  if(input.correction){const saved=await remember(req.user.id,randomUUID(),JSON.stringify({date:new Date().toISOString(),user:input.correction}),input.correction);if(!saved)throw new Error('Enable memory before saving a detail.');return res.json({saved:true});}
  res.json(await updateMemory(req.user.id,input));
 }));
 r.get('/number-countries',wrap(async(req,res)=>res.json({countries:await availableCountries()})));
 r.get('/numbers',wrap(async(req,res)=>res.json({numbers:await ownedNumbers()})));
 r.get('/numbers/:country',wrap(async(req,res)=>res.json(await numberCatalog(req.params.country))));
 r.get('/account',wrap(async(req,res)=>{
  if(!dbConfigured())return res.json({balance:0,reserved:0,transactions:[],calls:[]});
  const [wallet,ledger,calls]=await Promise.all([db().query('select * from callapp.wallets where user_id=$1',[req.user.id]),db().query('select id,title,cents,type,created_at as at from callapp.ledger where user_id=$1 order by created_at desc limit 100',[req.user.id]),db().query('select * from callapp.calls where user_id=$1 order by created_at desc limit 50',[req.user.id])]);
  res.json({balance:wallet.rows[0]?.balance||0,reserved:wallet.rows[0]?.reserved||0,transactions:ledger.rows,calls:calls.rows});
 }));
 r.post('/checkout',wrap(async(req,res)=>res.json(await checkout(req.user.id,req.body.cents))));
 r.post('/quote',wrap(async(req,res)=>{const p=z.object({placeId:z.string().max(200).optional(),destinationPhone:z.string().max(30).optional(),caller:z.string().optional()}).parse(req.body);res.json(await quote(p));}));
 r.post('/calls',wrap(async(req,res)=>{
  const p=z.object({threadId:z.uuid(),placeId:z.string().max(200).optional(),destinationPhone:z.string().max(30).optional(),caller:z.string(),quotedRate:z.number().int().min(1),limit:z.number().int().min(100).max(1000),plan:z.object({business:z.string().max(200),request:z.string().min(1).max(6000),name:z.string().max(100),date:z.string().max(30),time:z.string().max(30),guests:z.string().max(10)})}).parse(req.body);
  const memory=await recall(req.user.id,p.plan.request);
  p.plan._memory=memory.context;
  res.json({call:await placeCall(req.user.id,p)});
 }));
 r.get('/calls/:id',wrap(async(req,res)=>{
  const id=z.uuid().parse(req.params.id);let row=(await db().query('select * from callapp.calls where id=$1 and user_id=$2',[id,req.user.id])).rows[0];
  if(!row)return res.sendStatus(404);
  if(row.sid&&!terminal(row.status))await reconcileCall(row.id,row.sid);
  row=(await db().query('select * from callapp.calls where id=$1 and user_id=$2',[id,req.user.id])).rows[0];res.json({call:row});
 }));
 r.post('/calls/:id/end',wrap(async(req,res)=>{
  const id=z.uuid().parse(req.params.id);const row=(await db().query('select * from callapp.calls where id=$1 and user_id=$2',[id,req.user.id])).rows[0];
  if(!row?.sid)return res.status(404).json({error:'Call is not connected yet.'});
  if(!row.ended_at){await twilioClient().calls(row.sid).update({status:'completed'});await reconcileCall(row.id,row.sid);}res.json({ok:true});
 }));
 return r;
}
