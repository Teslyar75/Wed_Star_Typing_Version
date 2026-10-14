/** Контекстная справка F1 — порт stamina/page_help.py PageHelpDialog. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

type Tab = string;

/** Общий блок: навигация без мыши (web). */
const KEYBOARD_NAV =
  "НАВИГАЦИЯ С КЛАВИАТУРЫ\n\n" +
  "Можно пользоваться пультом без мыши — переходить по кнопкам и плашкам.\n\n" +
  "• Tab / Shift+Tab — следующий / предыдущий элемент интерфейса.\n" +
  "• ← → ↑ ↓ — соседняя кнопка или плашка в той же группе (вкладки, миссии, карточки…).\n" +
  "• Home / End — первый / последний элемент в группе.\n" +
  "• Enter / Пробел — активировать выбранную кнопку.\n" +
  "• Ctrl+1…6 — быстрый переход к зоне (1 мостик · 2 английский · 3 скорочтение · 4 отдых · 5 радио · 6 настройки).\n" +
  "• Миссии / Свой текст / Бортжурнал — подменю зоны Мостик; путь экрана — серые крошки под меню (⧉ копирует slug).\n" +
  "• F6 — цикл зон: шапка ↔ содержимое вкладки.\n" +
  "• Ctrl+K — палитра команд; F1 — эта справка; Esc — закрыть окно.\n" +
  "• Backspace — вернуться к предыдущему разделу (вне полей ввода).\n\n" +
  "В гипердрайве и играх отдыха стрелки остаются за управлением режима.";

/** Ключ вкладки → (заголовок, тело). Текст как в desktop PAGES. */
const PAGES: Record<string, { title: string; body: string }> = {
  bridge: {
    title: "МОСТИК",
    body:
      "Главный тренажёр печати.\n\n" +
      "• Печатайте строку в иллюминаторе — корабль летит вперёд.\n" +
      "• Esc — пауза; F5 — начать упражнение заново.\n" +
      "• Зелёные/красные зоны на клавиатуре подсказывают пальцы.\n" +
      "• После миссии смотрите отчёт: скорость, точность, слабые клавиши.",
  },
  missions: {
    title: "МИССИИ",
    body:
      "Курс из 20 миссий на раскладку (EN / RU).\n\n" +
      "• Открывайте миссии по порядку — следующие открываются после цели.\n" +
      "• «Ремонт систем» тренирует буквы, на которых вы чаще ошибаетесь.\n" +
      "• Цель миссии: нужная скорость при точности ≥ порога.",
  },
  cargo: {
    title: "СВОЙ ТЕКСТ",
    body:
      "Доставка вашего текста в тренажёр.\n\n" +
      "• Вставьте или введите текст; опции обработки — справа.\n" +
      "• «На мостик» — старт печати.\n" +
      "• Прогресс сохраняется; тот же текст попадает в библиотеку скорочтения.",
  },
  log: {
    title: "БОРТЖУРНАЛ",
    body:
      "История полётов: миссии, свой текст, статистика.\n\n" +
      "• Смотрите скорость, точность и опыт (XP).\n" +
      "• Можно повторить недавнее упражнение.",
  },
  english: {
    title: "АНГЛИЙСКИЙ",
    body:
      "Модуль изучения слов: карты, сканер, миссии, карточки.\n\n" +
      "• Подразделы — верхняя полоса вкладок.\n" +
      "• Сканер — быстрый переход к слову.\n" +
      "• F1 — справка текущего подраздела.",
  },
  speed: {
    title: "СКОРОЧТЕНИЕ",
    body:
      "RSVP-гипердрайв, книга, тренажёры, журнал.\n\n" +
      "• Выберите книгу на полке — перевод прогревается до входа в гипердрайв.\n" +
      "• Esc / Пробел — пауза; T — перевод под словом.\n" +
      "• Gutenberg / bilinguis — свободные книги на полку.",
  },
  lounge: {
    title: "ОТДЫХ",
    body:
      "Кают-компания: короткий перерыв между полётами.\n\n" +
      "• Змейка, тетрис, арканоид.\n" +
      "• Esc — пауза / выход в лобби.",
  },
  radio: {
    title: "РАДИОРУБКА",
    body:
      "Эфир и приёмник.\n\n" +
      "• Избранное, поиск станций, шкала громкости.\n" +
      "• Duck при наборе на мостике приглушает радио.",
  },
  settings: {
    title: "НАСТРОЙКИ",
    body:
      "Бортовые системы всего пульта.\n\n" +
      "• Язык интерфейса, звук, звёздное поле.\n" +
      "• Экипаж, скины, библиотека, читалка.",
  },
};

type Props = {
  tab: Tab;
  open: boolean;
  onClose: () => void;
  /** ПОЛНАЯ ИНСТРУКЦИЯ — как desktop PageHelpDialog._full_help */
  onFullHelp?: () => void;
};

export default function HelpDrawer({ tab, open, onClose, onFullHelp }: Props) {
  /** Зафиксировать вкладку в момент открытия — смена раздела не подменяет текст. */
  const lockedTab = useRef(tab);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) lockedTab.current = tab;
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    /* capture: закрыть до App.toggle, чтобы F1 не открыл снова */
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const page = PAGES[lockedTab.current] || PAGES.bridge!;

  /* Portal в body: иначе .cockpit > * { position:relative } ломает fixed — справка уезжает вниз страницы. */
  return createPortal(
    <div
      className="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("help")}
      onClick={onClose}
    >
      <aside className="help-modal inst-panel" onClick={(e) => e.stopPropagation()}>
        <header className="help-modal-h">
          <div className="help-modal-h-left">
            <span className="help-q" aria-hidden>
              ?
            </span>
            <div>
              <h2 className="route-title">{page.title}</h2>
              <span className="muted help-how">{t("help_how")}</span>
            </div>
          </div>
          <button type="button" className="hud-btn amber" onClick={onClose}>
            {t("close")} Esc
          </button>
        </header>
        <div className="help-modal-body">
          {page.body.split("\n").map((line, i) =>
            line.trim() === "" ? <br key={i} /> : <p key={i}>{line}</p>,
          )}
          <hr className="help-sep" />
          {KEYBOARD_NAV.split("\n").map((line, i) =>
            line.trim() === "" ? <br key={`k${i}`} /> : <p key={`k${i}`}>{line}</p>,
          )}
        </div>
        <footer className="help-modal-actions">
          {onFullHelp ? (
            <button
              type="button"
              className="hud-btn"
              onClick={() => {
                onClose();
                onFullHelp();
              }}
            >
              {t("help_full")}
            </button>
          ) : (
            <span className="muted help-modal-foot">F1 · Esc</span>
          )}
          <button type="button" className="hud-btn amber" onClick={onClose}>
            {t("close")} Esc
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
