/**
 * Глобально гасим wheel / trackpad scroll — кабина не должна ездить колёсиком.
 * Исключения: выпадающие списки, полоса вкладок, окна с собственной прокруткой.
 */

const OPT: AddEventListenerOptions = { capture: true, passive: false };

/** Селекторы зон, где колёсико/тач должны работать. */
const WHEEL_OK =
  [
    ".hud-select-menu",
    ".hud-select.open",
    ".top-bar-scroll",
    ".top-bar-scroll *",
    ".zone-settings",
    ".zone-settings *",
    ".settings-hub",
    ".settings-hub *",
    ".settings-cabin",
    ".settings-cabin *",
    ".sr-book-reader",
    ".sr-book-reader *",
    ".sr-book-stage",
    ".sr-book-stage *",
    ".lib-shelf",
    ".lib-shelf *",
    ".lib-passport",
    ".lib-passport *",
    ".flog",
    ".flog *",
    ".en-lists",
    ".en-lists *",
    ".help-modal-body",
    ".help-modal-body *",
    ".cmd-palette",
    ".cmd-palette *",
    ".stage.is-fs",
    ".stage.is-fs *",
    ".stage:fullscreen",
    ".stage:fullscreen *",
  ].join(", ");

const TOUCH_OK =
  "canvas, input, textarea, select, [contenteditable='true'], " + WHEEL_OK;

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
  if (t.closest(TOUCH_OK)) return;
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
