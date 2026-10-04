import type { Thread } from './model.ts';

export type JourneyStep = { label: string; detail: string; state: 'done' | 'current' | 'waiting' };

// A transport finishing is not proof that the requested task succeeded.
export function callJourney(thread: Thread): { label: string; steps: JourneyStep[] } {
  const ended = thread.status === 'completed' || thread.status === 'cancelled';
  const calling = thread.status === 'calling';
  const ready = thread.status === 'ready';
  const recipientKnown = Boolean(thread.discovery?.selected || thread.discovery?.intent.phone || ready || calling || ended);
  const label = calling ? 'Call in progress'
    : thread.status === 'cancelled' ? 'Call ended'
    : ended && thread.callOutcome === 'confirmed' ? 'Request completed'
    : ended && thread.callOutcome === 'needs_input' ? 'Your answer is needed'
    : ended && thread.callOutcome === 'unconfirmed' ? 'Outcome needs review'
    : ended ? 'Reviewing the outcome'
    : ready ? 'Ready for your approval' : 'Preparing your request';
  return { label, steps: [
    { label: 'Find the right recipient', detail: recipientKnown ? thread.plan.business || thread.discovery?.selected?.name || thread.discovery?.intent.phone || 'Recipient selected' : 'Use a name, place, or phone number.', state: recipientKnown ? 'done' : 'current' },
    { label: 'Review the call', detail: ready ? 'Check the request and spending limit before calling.' : calling || ended ? 'Call was started with your approval.' : 'We’ll collect only the details needed.', state: calling || ended ? 'done' : recipientKnown ? 'current' : 'waiting' },
    { label: 'Make the call', detail: calling ? thread.callStatus === 'in-progress' ? 'Speaking with the recipient.' : thread.callStatus === 'ringing' ? 'The phone is ringing.' : 'Connecting the call.' : ended ? 'The call has ended.' : 'No call is placed until you approve.', state: ended ? 'done' : calling ? 'current' : 'waiting' },
    { label: 'Bring back the result', detail: ended ? thread.followUpQuestion || thread.callSummary || label : 'Summary, transcript, and any question for you.', state: ended && thread.callOutcome === 'confirmed' ? 'done' : ended ? 'current' : 'waiting' },
  ] };
}
