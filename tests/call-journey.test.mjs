import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callJourney } from '../src/call-journey.ts';
import { emptyPlan } from '../src/model.ts';

const thread = (fields = {}) => ({ id: 'test', title: 'Test request', kind: 'other', created: new Date().toISOString(), status: 'draft', plan: emptyPlan(), messages: [], ...fields });
test('a completed transport without a reviewed outcome never claims task success', () => {
  const journey = callJourney(thread({ status: 'completed' }));
  assert.equal(journey.label, 'Reviewing the outcome');
  assert.equal(journey.steps[3].state, 'current');
});
test('missing information remains actionable while confirmed tasks finish', () => {
  const blocked = callJourney(thread({ status: 'completed', callOutcome: 'needs_input', followUpQuestion: 'What is your order number?' }));
  assert.equal(blocked.steps[3].detail, 'What is your order number?');
  assert.equal(blocked.steps[3].state, 'current');
  const success = callJourney(thread({ status: 'completed', callOutcome: 'confirmed', callSummary: 'Table booked for 7pm.' }));
  assert.equal(success.label, 'Request completed');
  assert.equal(success.steps[3].state, 'done');
});
test('drafts and ready requests do not claim a call has been placed', () => {
  assert.equal(callJourney(thread()).steps[2].state, 'waiting');
  const ready = callJourney(thread({ status: 'ready' }));
  assert.equal(ready.label, 'Ready for your approval');
  assert.equal(ready.steps[1].state, 'current');
  assert.equal(ready.steps[2].state, 'waiting');
});
test('ringing and cancelled calls show their actual state', () => {
  assert.equal(callJourney(thread({ status: 'calling', callStatus: 'ringing' })).steps[2].detail, 'The phone is ringing.');
  assert.equal(callJourney(thread({ status: 'cancelled' })).label, 'Call ended');
});
