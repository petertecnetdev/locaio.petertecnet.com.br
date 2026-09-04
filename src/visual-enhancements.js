const cleanupFns = [];

export function installVisualEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const root = document.documentElement;
  const body = document.body;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const updateScrollState = () => {
    root.dataset.scrolled = window.scrollY > 12 ? 'true' : 'false';
  };

  const updatePointer = (event) => {
    if (reducedMotion?.matches) return;
    root.style.setProperty('--pointer-x', `${event.clientX}px`);
    root.style.setProperty('--pointer-y', `${event.clientY}px`);
  };

  const updateInputMode = (event) => {
    if (event.key === 'Tab') body.dataset.inputMode = 'keyboard';
  };

  const usePointerMode = () => {
    body.dataset.inputMode = 'pointer';
  };

  updateScrollState();
  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('keydown', updateInputMode);
  window.addEventListener('pointerdown', usePointerMode, { passive: true });

  cleanupFns.push(
    () => window.removeEventListener('scroll', updateScrollState),
    () => window.removeEventListener('pointermove', updatePointer),
    () => window.removeEventListener('keydown', updateInputMode),
    () => window.removeEventListener('pointerdown', usePointerMode),
  );

  return () => {
    while (cleanupFns.length) cleanupFns.pop()?.();
  };
}
