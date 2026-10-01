import test from 'node:test';import assert from 'node:assert/strict';
import {insideBounds} from '../server/geography.mjs';
test('explicit city bounds exclude distant matches and handle the date line',()=>{
 const pattaya={low:{latitude:12.7,longitude:100.7},high:{latitude:13.1,longitude:101.1}};
 assert.equal(insideBounds({latitude:12.93,longitude:100.88},pattaya),true);
 assert.equal(insideBounds({latitude:38.6,longitude:-90.4},pattaya),false);
 assert.equal(insideBounds(undefined,pattaya),false);
 const crossing={low:{latitude:-20,longitude:170},high:{latitude:20,longitude:-170}};
 assert.equal(insideBounds({latitude:0,longitude:-179},crossing),true);
 assert.equal(insideBounds({latitude:0,longitude:0},crossing),false);
});
test('pending request survives reload and expires instead of resuming stale work',async()=>{
 const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};globalThis.sessionStorage={removeItem:()=>{}};
 const {savePending,readPending,clearPending}=await import('../src/pending.ts');
 const draft={id:'request',threadId:'conversation',text:'Call PJ Tavern in Pattaya',created:Date.now(),email:'test@example.com'};
 savePending(draft);assert.deepEqual(readPending(),draft);clearPending();assert.equal(readPending(),null);
 savePending({...draft,created:Date.now()-86400001});assert.equal(readPending(),null);
 delete globalThis.localStorage;delete globalThis.sessionStorage;
});
