// Opt-in real-provider verification with disposable synthetic users. Never dials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import express from 'express';
import {db} from '../server/db.mjs';
import {memoryClient,memoryTag,remember,recall,flushMemories,rememberedPhone,updateMemory} from '../server/memory.mjs';
import {discoveryRouter} from '../server/discovery.mjs';
const u=new URL(process.env.DATABASE_URL);u.username='postgres.tgzjcpifdjcjbmdhwaca';u.password=process.env.SUPABASE_DB_PASSWORD;
const admin=new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('server/supabase-ca.crt','utf8')}});
const users=[randomUUID(),randomUUID()];let server;
try{
 await admin.connect();
 for(const id of users)await admin.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",[id,`memory-test-${id}@example.invalid`]);
 const statement='My mom is Evelyn. Her phone number is +14155550123. I prefer vegetarian food and quiet restaurants. This is synthetic integration test data.';
 assert.equal(await remember(users[0],'first',{toString:()=>statement},statement),true);
 assert.equal(await rememberedPhone(users[0],'+14155550123'),true);
 assert.equal(await rememberedPhone(users[1],'+14155550123'),false);
 await flushMemories();
 const rows=(await db().query('select id,sent_at from callapp.memory_events where user_id=$1',[users[0]])).rows;
 assert.ok(rows[0].sent_at,'Provider must accept ingestion');
 let providerRecall=false;
 for(let i=0;i<18;i++){
  const r=await memoryClient().search({containerTag:memoryTag(users[0]),q:'Who is my mom and what is her phone number?',searchMode:'hybrid',limit:5});
  if(JSON.stringify(r.results).includes('Evelyn')){providerRecall=true;break;}
  await new Promise(r=>setTimeout(r,4000));
 }
 assert.ok(providerRecall,'Provider must retrieve ingested memory');
 const other=await memoryClient().search({containerTag:memoryTag(users[1]),q:'Evelyn',searchMode:'hybrid'});
 assert.equal(other.results.length,0,'Other user must not see memory');
 const app=express();app.use(express.json());app.use('/api',discoveryRouter({auth:{getUser:async token=>({data:{user:{id:token===users[0]?users[0]:users[1]}}})}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const previous={business:'',phone:'',area:'',request:'',kind:'other',date:'',time:'',guests:'',name:''};
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/prepare`,{method:'POST',headers:{Authorization:`Bearer ${users[0]}`,'Content-Type':'application/json'},body:JSON.stringify({text:'Call my mom and tell her I will be there at 7 tonight.',previous,history:[],today:'2026-10-02'})});
 const decision=await response.json();assert.equal(response.status,200);assert.equal(decision.intent.phone,'+14155550123','Fresh chat must resolve Mom from memory');
 await updateMemory(users[0],{enabled:false});assert.equal((await recall(users[0],'mom')).context,'');
 await updateMemory(users[0],{enabled:true,reset:true});assert.equal(await rememberedPhone(users[0],'+14155550123'),false);
 assert.ok(!(await recall(users[0],'mom')).context.includes('Evelyn'));
 console.log('PASS: provider ingestion and retrieval; fresh-chat Mom resolution; cross-user isolation; pause and reset. No call placed.');
 writeFileSync('output/memory-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),providerRecall,isolated:true,freshChatContact:true,pause:true,reset:true},null,2));
}finally{
 server?.close();
 for(const id of users){for(const gen of [0,1])try{await memoryClient().delete(`/v3/container-tags/${memoryTag(id,gen)}`);}catch(e){if(e.status!==404)console.log('Synthetic provider cleanup pending',e.status);}
 await admin.query('delete from auth.users where id=$1',[id]);await db().query('delete from callapp.memory_cleanup where tag=$1',[memoryTag(id)]);}
 await admin.end();await db().end();
}
