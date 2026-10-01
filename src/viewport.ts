/** Keep the app on the layout viewport; only the keyboard should shorten it. */
export function appViewportSize({
  layoutHeight,
  visualHeight,
  visualTop,
  focused,
}: {
  layoutHeight: number;
  visualHeight?: number;
  visualTop?: number;
  focused: boolean;
}) {
  const keyboard = Boolean(focused && visualHeight && layoutHeight - visualHeight > 120);
  return {
    height: keyboard ? visualHeight! : layoutHeight,
    top: keyboard ? (visualTop ?? 0) : 0,
    keyboard,
  };
}

export function installAppViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Do not turn intentional pinch zoom into a layout resize.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const focused = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
    const size = appViewportSize({
      layoutHeight: window.innerHeight,
      visualHeight: viewport?.height,
      visualTop: viewport?.offsetTop,
      focused: Boolean(focused),
    });
    root.style.setProperty('--app-height', `${size.height}px`);
    root.style.setProperty('--app-top', `${size.top}px`);
    root.dataset.keyboard = String(size.keyboard);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
  };
}
