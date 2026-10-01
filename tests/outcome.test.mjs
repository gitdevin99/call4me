import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReview,reviewCall} from '../server/outcome.mjs';

const booking={plan:{request:'Book a table for two tomorrow evening.'},transcript:[{role:'Business',text:'Yes, that.'},{role:'Assistant',text:'Great, the reservation is confirmed.'}]};

test('an agreeable but ambiguous recipient reply does not verify a reservation',()=>{
 const result=normalizeReview({status:'confirmed',summary:'Confirmed at 5 p.m.',recipient_evidence:'Yes, that.',next_step:'No further action needed.'},booking);
 assert.equal(result.status,'unconfirmed');
 assert.match(result.summary,/did not clearly verify/);
});

test('a requested order number becomes one specific customer question',()=>{
 const row={plan:{request:'Ask about my order.'},transcript:[{role:'Business',text:'Could you give me the order number?'}]};
 const result=normalizeReview({status:'needs_input',summary:'They need the order number to look it up.',question:'What is your order number?',next_step:'Find the order number in your confirmation email and reply here.',recipient_evidence:'Could you give me the order number?'},row);
 assert.equal(result.status,'needs_input');
 assert.equal(result.question,'What is your order number?');
 assert.match(result.nextStep,/confirmation email/);
});

test('a suggested follow-up unsupported by the recipient is not presented as fact',()=>{
 const result=normalizeReview({status:'needs_input',summary:'Need your passport number.',question:'What is your passport number?',recipient_evidence:'Please give me a passport number.'},booking);
 assert.equal(result.status,'unconfirmed');
 assert.equal(result.question,'');
});
test('payment credentials are never requested through the follow-up chat',()=>{
 const row={plan:{request:'Ask about my order.'},transcript:[{role:'Business',text:'We need your credit card number.'}]};
 const result=normalizeReview({status:'needs_input',summary:'We need the card.',question:'What is your credit card number?',next_step:'Reply with the card number.',recipient_evidence:'We need your credit card number.'},row);
 assert.equal(result.status,'unconfirmed');
 assert.equal(result.question,'');
 assert.match(result.nextStep,/directly/);
});

test('reviewCall sends the transcript and normalizes the returned JSON',async()=>{
 let body;
 const row={plan:{request:'Ask about my order.'},summary:'No result yet.',transcript:[{role:'Business',text:'Could you give me the order number?'}]};
 const prior=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';
 try{
  const result=await reviewCall(row,async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({status:'needs_input',summary:'They need the order number.',question:'What is your order number?',next_step:'Find it in your receipt and reply here.',recipient_evidence:'Could you give me the order number?'})}}]})};});
  assert.equal(body.messages[1].content.includes('Could you give me the order number?'),true);
  assert.equal(result.status,'needs_input');
 }finally{if(prior===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prior;}
});
