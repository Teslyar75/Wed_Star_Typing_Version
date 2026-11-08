/**
 * ResizeObserver без петли обратной связи: игнор собственного reflow
 * (как quiet-кадр в stageFit), округление px, disconnect на cleanup.
 */

export type BoxSize = { w: number; h: number };

export function observeBox(el: Element, onSize: (size: BoxSize) => void): () => void {
  let quiet = false;
  let lastW = -1;
  let lastH = -1;
  let raf = 0;

  const emit = () => {
    if (quiet) return;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 1 && h < 1) return;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    quiet = true;
    try {
      onSize({ w, h });
    } finally {
      raf = requestAnimationFrame(() => {
        quiet = false;
      });
    }
  };

  emit();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(emit) : null;
  ro?.observe(el);
  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
  };
}
