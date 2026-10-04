import type { Thread } from './model';
import { useEffect, useState } from 'react';
import { pipFrame, pipPosition, pipDuration, pipAnimationCss } from './pip-animation';
import type { PipMood } from './pip-animation';

export function pipMood(thread?: Thread, thinking = false): PipMood {
  if (thinking) return 'thinking';
  if (thread?.status === 'calling') return 'calling';
  if (thread?.status === 'completed' && thread.callOutcome === 'confirmed') return 'happy';
  if (thread) return 'listening';
  return 'welcome';
}

export function Pip({ mood = 'welcome', size = 'small' }: { mood?: PipMood; size?: 'small' | 'hero' }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const atlas = new Image();
    atlas.onload = () => setLoaded(true);
    atlas.src = '/characters/pip-sprite-v2.webp';
    return () => { atlas.onload = null; };
  }, []);
  const image = mood === 'happy' ? 'happy' : mood === 'welcome' ? 'welcome' : 'attentive';
  return <span className={`pip pip-${size} pip-${mood}`} aria-hidden="true">
    <span className="pip-halo"/>
    {size === 'hero' && <span className="pip-shadow"/>}
    {loaded ? <span className="pip-sprite" data-motion={mood} style={{backgroundPosition: pipPosition(pipFrame(mood, 0, true)), animationName: `pip-frames-${mood}`, animationDuration: `${pipDuration(mood)}ms`}}/> : <img src={`/characters/pip-${image}.png`} alt="" width="256" height="256" decoding="async"/>}
    {mood === 'calling' && <span className="pip-sound"><i/><i/><i/></span>}
  </span>;
}

export function PipAnimationStyles() {
  return <style>{pipAnimationCss()}</style>;
}
