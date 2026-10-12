import { t } from "../i18n";

type Tab = string;

const HELP: Record<string, string> = {
  bridge: "Мостик: навигационный канал, uplink, двигатель / клавиатура / телеметрия. Esc — пауза.",
  missions: "Миссии ★★★ и ремонт клавиш. Старт открывает мостик.",
  cargo: "Свой текст / полка: PDF, Gutenberg, Bilinguis.",
  log: "Бортжурнал (в работе) — сводка ContinueHub.",
  english: "English-хаб: обзор, проверка, склад, из книги, журнал.",
  speed: "Скорочтение: RSVP, Горбов, тахистоскоп, журнал.",
  lounge: "Отдых: змейка, тетрис, breakout — короткий перерыв между полётами.",
  radio: "Радиорубка: эфир, избранное, приёмник.",
  settings: "Настройки кабины, скины, экипаж, библиотека, читалка.",
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
