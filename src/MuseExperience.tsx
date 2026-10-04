import { ArrowUpRight, Check, ChevronRight, Headphones, Phone, ShieldCheck, Utensils, Scissors, UserRound, Circle, LoaderCircle } from 'lucide-react';
import type { Thread } from './model';
import { chatTime } from './model';
import { callJourney } from './call-journey';
import { useEffect, useState } from 'react';
import { Pip, pipMood } from './Pip';

const choices = [
  { icon: Utensils, label: 'Book a table', detail: 'Dinner plans, handled.' },
  { icon: Scissors, label: 'An appointment', detail: 'Find a time that works.' },
  { icon: Headphones, label: 'Customer support', detail: 'Get someone on the line.' },
  { icon: UserRound, label: 'Call someone', detail: 'A person, not just a place.' },
];

export function MuseHome({ name, threads, onChoice, onOpen, engaged = false }: {
  name: string; threads: Thread[]; onChoice: (index: number) => void; onOpen: (id: string) => void; engaged?: boolean;
}) {
  const firstName = name.trim().split(/\s+/)[0];
  const recent = threads.slice(0, 3);
  const [greeted, setGreeted] = useState(false);
  useEffect(() => {
    if (!greeted) return;
    const timer = setTimeout(() => setGreeted(false), 1600);
    return () => clearTimeout(timer);
  }, [greeted]);
  return <div className="muse-home">
    <div className="muse-intro">
      <button className="pip-greeting" aria-label="Say hello to Pip" onClick={() => setGreeted(value => !value)}><Pip size="hero" mood={engaged ? 'listening' : greeted ? 'happy' : 'welcome'}/></button>
      <p className="muse-greeting" aria-live="polite">{greeted ? 'You text. I talk. We make a good team.' : firstName ? `Hi, ${firstName}. I’m Pip.` : 'Hi, I’m Pip. Your AI calling assistant.'}</p>
      <h1>Who are we<br/><span>calling today?</span></h1>
      <p className="muse-subtitle">The calls you’ve been putting off?<br/>Let’s take one off your list.</p>
    </div>
    <section className="muse-shortcuts" aria-label="Start a call request">
      {choices.map((choice, index) => <button key={choice.label} onClick={() => onChoice(index)}>
        <choice.icon size={21} strokeWidth={1.6}/><strong>{choice.label}</strong><span>{choice.detail}</span><ArrowUpRight size={15}/>
      </button>)}
    </section>
    {recent.length > 0 ? <section className="muse-recent" aria-label="Recent requests">
      <h2>Pick up where you left off</h2>
      {recent.map(thread => <button key={thread.id} onClick={() => onOpen(thread.id)}>
        <span className={`muse-recent-icon ${thread.callOutcome === 'confirmed' ? 'finished' : ''}`}>
          {thread.callOutcome === 'confirmed' ? <Check size={17}/> : <Phone size={17}/>}</span>
        <span><strong>{thread.title}</strong><small>{callJourney(thread).label} · {chatTime(thread.created)}</small></span><ChevronRight size={17}/>
      </button>)}
    </section> : <div className="muse-how"><span>Tell me</span><ChevronRight size={13}/><span>Review & approve</span><ChevronRight size={13}/><span>I’ll call</span></div>}
    <p className="muse-assurance"><ShieldCheck size={14}/> You approve every call. Pay only as you go.</p>
  </div>;
}

export function CallJourney({ thread }: { thread: Thread }) {
  const journey = callJourney(thread);
  return <details className="muse-journey">
    <summary><Pip mood={pipMood(thread)}/><span><small>PIP’S CALL PLAN</small><strong>{journey.label}</strong></span><ChevronRight size={17}/></summary>
    <ol>{journey.steps.map(step => <li key={step.label} data-state={step.state}>
      <span>{step.state === 'done' ? <Check size={15}/> : step.state === 'current' && thread.status === 'calling' ? <LoaderCircle size={15}/> : <Circle size={12}/>}</span>
      <div><strong>{step.label}</strong><p>{step.detail}</p></div>
    </li>)}</ol>
  </details>;
}
