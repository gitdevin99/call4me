/** Fit the app to the visible screen, including mobile keyboard changes. */
export function installAppViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Do not turn intentional pinch zoom into a layout resize.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport?.height ?? window.innerHeight;
    root.style.setProperty('--app-height', `${height}px`);
    root.style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`);
    const focused = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
    root.dataset.keyboard = String(Boolean(focused && window.innerHeight - height > 120));
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
