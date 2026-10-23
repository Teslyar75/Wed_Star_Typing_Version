/** Кнопка ЭКРАН / ✕. Горячая: Page Down. */
import { t } from "../i18n";

type Props = {
  fullscreen: boolean;
  onToggle: () => void;
};

export default function FullscreenButton({ fullscreen, onToggle }: Props) {
  const tip = fullscreen ? t("sr_book_fs_exit_tip") : `${t("sr_book_fs")} · Page Down`;
  return (
    <button
      type="button"
      className={`hud-btn zone-fs-btn ${fullscreen ? "amber" : "ok"}`}
      title={tip}
      aria-keyshortcuts="PageDown"
      onClick={onToggle}
    >
      {fullscreen ? "✕" : t("sr_book_fs")}
    </button>
  );
}
