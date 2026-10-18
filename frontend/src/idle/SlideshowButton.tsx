/** Кнопка слайдшоу. Горячая клавиша: Page Up. */
import { useEffect } from "react";
import { shouldBlockChromeHotkey } from "../shell/keyboardNav";
import { IDLE_OPEN_EVENT } from "./IdleSlideshow";
import { ti } from "./idleI18n";

export function isSlideshowHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return e.key === "PageUp";
}

export default function SlideshowButton() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSlideshowHotkey(e)) return;
      if (shouldBlockChromeHotkey(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new Event(IDLE_OPEN_EVENT));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <button
      type="button"
      className="hud-btn zone-fs-btn ok"
      title={`${ti("btn_tip")} · Page Up`}
      aria-label={`${ti("btn_tip")} · Page Up`}
      aria-keyshortcuts="PageUp"
      onClick={() => window.dispatchEvent(new Event(IDLE_OPEN_EVENT))}
    >
      {ti("btn")}
    </button>
  );
}
