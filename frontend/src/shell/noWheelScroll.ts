/**
 * Глобально гасим wheel / trackpad scroll — кабина не должна ездить колёсиком.
 * Исключения:
 * - выпадающие списки HUD (страны/языки/жанры радио);
 * - полоса `.top-bar-scroll` (вкладки + XP + радио + ?/♪) — горизонтальный сдвиг.
 */

const OPT: AddEventListenerOptions = { capture: true, passive: false };

const WHEEL_OK =
  ".hud-select-menu, .hud-select.open, .top-bar-scroll, .top-bar-scroll *";

function blockWheel(e: WheelEvent) {
  const t = e.target;
  if (t instanceof Element && t.closest(WHEEL_OK)) return;
  e.preventDefault();
  e.stopPropagation();
}

function blockTouchMove(e: TouchEvent) {
  const t = e.target;
  if (!(t instanceof Element)) {
    e.preventDefault();
    return;
  }
  if (
    t.closest(
      "canvas, input, textarea, select, [contenteditable='true'], .hud-select-menu, .top-bar-scroll",
    )
  )
    return;
  e.preventDefault();
}

export function installNoWheelScroll(): () => void {
  window.addEventListener("wheel", blockWheel, OPT);
  document.addEventListener("wheel", blockWheel, OPT);
  document.addEventListener("touchmove", blockTouchMove, OPT);
  return () => {
    window.removeEventListener("wheel", blockWheel, OPT);
    document.removeEventListener("wheel", blockWheel, OPT);
    document.removeEventListener("touchmove", blockTouchMove, OPT);
  };
}
