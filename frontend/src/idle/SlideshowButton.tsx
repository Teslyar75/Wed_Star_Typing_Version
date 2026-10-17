/** Кнопка запуска слайдшоу с любого места — рядом с ЭКРАН. */
import { IDLE_OPEN_EVENT } from "./IdleSlideshow";
import { ti } from "./idleI18n";

export default function SlideshowButton() {
  return (
    <button
      type="button"
      className="hud-btn zone-fs-btn ok"
      title={ti("btn_tip")}
      aria-label={ti("btn_tip")}
      onClick={() => window.dispatchEvent(new Event(IDLE_OPEN_EVENT))}
    >
      {ti("btn")}
    </button>
  );
}
