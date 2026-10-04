import type { Thread } from './model';

export type PipMood = 'welcome' | 'thinking' | 'calling' | 'happy' | 'listening';

export function pipMood(thread?: Thread, thinking = false): PipMood {
  if (thinking) return 'thinking';
  if (thread?.status === 'calling') return 'calling';
  if (thread?.status === 'completed' && thread.callOutcome === 'confirmed') return 'happy';
  if (thread) return 'listening';
  return 'welcome';
}

export function Pip({ mood = 'welcome', size = 'small' }: { mood?: PipMood; size?: 'small' | 'hero' }) {
  const image = mood === 'happy' ? 'happy' : mood === 'welcome' ? 'welcome' : 'attentive';
  return <span className={`pip pip-${size} pip-${mood}`} aria-hidden="true">
    <span className="pip-halo"/>
    <img src={`/characters/pip-${image}.png`} alt="" width="256" height="256" decoding="async"/>
    {mood === 'calling' && <span className="pip-sound"><i/><i/><i/></span>}
  </span>;
}
