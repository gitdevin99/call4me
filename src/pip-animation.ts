export type PipMood = 'welcome' | 'thinking' | 'calling' | 'happy' | 'listening';

type Step = readonly [frame: number, duration: number];
const sequences: Record<PipMood, readonly Step[]> = {
  welcome: [[0, 1200], [1, 80], [2, 120], [3, 100], [0, 400], [4, 140], [5, 120], [6, 170], [5, 120], [6, 170], [7, 140], [4, 150], [0, 1200]],
  listening: [[8, 500], [9, 250], [10, 550], [11, 450], [10, 300], [9, 400]],
  thinking: [[9, 350], [8, 650], [9, 350], [10, 650], [11, 450]],
  calling: [[12, 160], [13, 140], [14, 180], [13, 100], [12, 300]],
  happy: [[15, 1000]],
};

export function pipFrame(mood: PipMood, elapsed: number, reduced = false): number {
  if (reduced) return mood === 'happy' ? 15 : mood === 'welcome' ? 0 : 9;
  const sequence = sequences[mood];
  const duration = sequence.reduce((sum, [, ms]) => sum + ms, 0);
  let time = Math.max(0, elapsed) % duration;
  for (const [frame, ms] of sequence) {
    if (time < ms) return frame;
    time -= ms;
  }
  return sequence[0][0];
}

export function pipPosition(frame: number) {
  return `${(frame % 4) * 100 / 3}% ${Math.floor(frame / 4) * 100 / 3}%`;
}

export function pipDuration(mood: PipMood) {
  return sequences[mood].reduce((sum, [, ms]) => sum + ms, 0);
}

// Native CSS plays the atlas; React only switches the behavioral state.
export function pipAnimationCss() {
  return (Object.keys(sequences) as PipMood[]).map(mood => {
    const duration = pipDuration(mood);
    let time = 0;
    const frames = sequences[mood].map(([frame, ms]) => {
      const rule = `${time / duration * 100}%{background-position:${pipPosition(frame)}}`;
      time += ms;
      return rule;
    }).join('');
    return `@keyframes pip-frames-${mood}{${frames}100%{background-position:${pipPosition(sequences[mood][0][0])}}}`;
  }).join('');
}
