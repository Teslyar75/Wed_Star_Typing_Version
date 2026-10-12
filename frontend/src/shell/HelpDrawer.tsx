import { t } from "../i18n";

type Tab = string;

const HELP: Record<string, string> = {
  bridge: "Мостик: набор с миссиями ★★★. Esc — пауза. После финиша сессия уходит на сервер.",
  reader: "2 языка: свайп сегментов, перевод в фоне, позиция sentence_id на сервере.",
  library: "Полка: PDF/TXT, Gutenberg, Bilinguis. Продолжить / English из книги / Speed.",
  english: "English-хаб: обзор, проверка, склад, из книги, журнал оценок (sync).",
  speed: "Скорочтение: RSVP, разгон WPM, Горбов, тахистоскоп, журнал с графиком.",
  radio: "Эфир: фильтры, избранное на сервере, Space/←→/+/- в приёмнике.",
  lounge: "Кают-компания: Snake / Tetris / Breakout, рекорды на сервере, touch.",
  auth: "Экипаж: PIN, гость, досье 7 дней, экспорт .stpilot.",
  skins: "Скины кабины и профиль фона living_space.",
};

type Props = { tab: Tab; open: boolean; onClose: () => void };

export default function HelpDrawer({ tab, open, onClose }: Props) {
  if (!open) return null;
  return (
    <aside className="help-drawer" role="complementary" aria-label={t("help")}>
      <header className="bridge-actions">
        <strong>{t("help")}</strong>
        <button type="button" className="hud-btn" onClick={onClose}>
          Esc
        </button>
      </header>
      <p>{HELP[tab] || HELP.bridge}</p>
      <p className="muted">F1 / ? — справка · Ctrl+K — команды · Tab — вкладки</p>
    </aside>
  );
}
