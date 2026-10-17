/** Кнопка ЭКРАН / ✕ — как в speed/book. */
import { t } from "../i18n";

type Props = {
  fullscreen: boolean;
  onToggle: () => void;
};

export default function FullscreenButton({ fullscreen, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`hud-btn zone-fs-btn ${fullscreen ? "amber" : "ok"}`}
      title={fullscreen ? t("sr_book_fs_exit_tip") : t("sr_book_fs_tip")}
      onClick={onToggle}
    >
      {fullscreen ? "✕" : t("sr_book_fs")}
    </button>
  );
}
