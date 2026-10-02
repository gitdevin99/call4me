import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryTag,knownPhone,memoryText,recall,remember} from '../server/memory.mjs';
test('memory namespaces isolate users and reset generations',()=>{
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 assert.notEqual(memoryTag(a),memoryTag(b));assert.notEqual(memoryTag(a),memoryTag(a,1));assert.match(memoryTag(a),/^[a-zA-Z0-9_:-]+$/);assert.throws(()=>memoryTag('../another-user'));
});
test('recalled destination must match a valid user-supplied number',()=>{
 assert.equal(knownPhone('+14155550123',['Mom is +1 (415) 555-0123.']),true);
 assert.equal(knownPhone('+14155550124',['Mom is +1 (415) 555-0123.']),false);
 assert.equal(knownPhone('+14155550123',[]),false);
});
test('memory is optional and fails open without credentials',async()=>{
 const old=process.env.SUPERMEMORY_API_KEY;delete process.env.SUPERMEMORY_API_KEY;
 try{assert.deepEqual(await recall('invalid','hello'),{context:'',available:false});assert.equal(await remember('invalid','x','hello'),false);}finally{if(old)process.env.SUPERMEMORY_API_KEY=old;}
});
test('obvious API credentials are removed before ingestion',()=>{
 assert.equal(memoryText('key sm_123456789012345678901234567890 end'),'key [secret removed] end');
});
