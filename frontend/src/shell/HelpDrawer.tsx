/** Контекстная справка F1 — порт stamina/page_help.py PageHelpDialog. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, getLang } from "../i18n";
import { voiceLookup } from "../theme/voice";
import { ti } from "../idle/idleI18n";
import { zt } from "../zen/zenI18n";

type Tab = string;

/** Общий блок: навигация без мыши (web) — как stamina/keynav.py. */
const KEYBOARD_NAV =
  "НАВИГАЦИЯ С КЛАВИАТУРЫ\n\n" +
  "Как на десктопе: несколько способов добраться до кнопок без мыши.\n\n" +
  "• Tab — прыжок к вкладке текущей зоны (МОСТИК / …); ещё раз Tab — к кнопкам ниже (подменю, Орион, слайды…).\n" +
  "• Shift+Tab или Esc — снять фокус с кнопок (вернуться к набору / сцене).\n" +
  "• ← → ↑ ↓ — соседняя кнопка по положению на экране (вкладки, подменю, шапка, панели).\n" +
  "• Ctrl+Home / Ctrl+End — первая / последняя кнопка в группе.\n" +
  "• Enter / Пробел — нажать кнопку в фокусе.\n" +
  "• Home — Орион · Page Up — слайды · Page Down — экран.\n" +
  "• Ctrl+1…9 — зона (без lab); Ctrl+0 — Лаборатория; F6 — цикл шапка ↔ содержимое.\n" +
  "• Ctrl+K — палитра; F1 — справка; Backspace — предыдущий раздел.\n\n" +
  "Tab с мостика уводит к кнопкам (полёт ставится на паузу). Стрелки во время набора остаются в прицеле — сначала Tab.\n" +
  "В гипердрайве и играх отдыха стрелки остаются за управлением режима.";

/** Ключ вкладки → (заголовок, тело). Текст как в desktop PAGES. */
const PAGES: Record<string, { title: string; body: string }> = {
  bridge: {
    title: "МОСТИК",
    body:
      "Главный тренажёр печати.\n\n" +
      "• Печатайте строку в иллюминаторе — корабль летит вперёд.\n" +
      "• Esc — пауза; F5 — начать упражнение заново.\n" +
      "• Ctrl+M — дзен-портал (набор как Monkeytype, текст с мостика). Esc — заново, Esc Esc — на борт.\n" +
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
      "• F1 — справка текущего подраздела.\n\n" +
      "ГОЛОС ОЗВУЧКИ (Английский → Настройки)\n\n" +
      "• Движок HD — нейроголоса Microsoft (Aria, Jenny, Guy, Andrew, Sonia, Ryan…) с сервера: " +
      "одинаково чистое произношение в Chrome, Firefox, Edge и Safari. Фразы кэшируются на диске.\n" +
      "• Движок «Браузер» — голоса самой системы; работает без сети. Авто-выбор: Microsoft Natural → Google US/UK English → прочие сетевые → любой en-*.\n" +
      "• Если HD недоступен (нет интернета), звучит лучший голос браузера автоматически.\n" +
      "• Метки: HD — нейроголос, NET — сетевой/улучшенный, STD — старый синтезатор.\n" +
      "• Язык EN/RU/UK/DE — отдельный голос для каждого языка; акцент US/UK/AU/CA/IE/IN — фильтр.\n" +
      "• Клавиши: Tab — к сетке голосов; стрелки/Home/End — по голосам; Enter — выбрать; Пробел или P — прослушать; ползунок ← → — скорость.",
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
      "Радиорубка: станции и приёмник.\n\n" +
      "• Избранное, поиск станций, шкала громкости.\n" +
      "• Duck при наборе на мостике приглушает радио.\n" +
      "• Подстраница «эфир» здесь — вещание станции, не чат экипажа.",
  },
  comm: {
    title: "ЭФИР",
    body:
      "Эфир — общая лента сообщений экипажа.\n\n" +
      "• Напишите в поле внизу и нажмите «ОТПРАВИТЬ» (или Enter).\n" +
      "• Видны все сообщения: и ваши, и других пилотов. Своё отмечено ▸.\n" +
      "• «ОБНОВИТЬ» — перечитать ленту; непрочитанное подсвечивает кнопку ЭФИР.\n" +
      "• Это канал пилотов, не разговор с Орионом.",
  },
  docs: {
    title: "ДОКУМЕНТЫ",
    body:
      "Бортовой блокнот пилота. Документы лежат в профиле, не в файлах браузера.\n\n" +
      "• Список — создать и открыть.\n" +
      "• Текст сохраняется сам; при ошибке или конфликте статус честный, чужая запись не перезаписывается.\n" +
      "• Версии — снимки не чаще чем раз в 10 минут, последние 20.\n" +
      "• Печать — кнопка «Печать» и стили браузера (Ctrl+P).",
  },
  lab: {
    title: "ЛАБОРАТОРИЯ",
    body:
      "Созвездия знаний пилота — живая сущность из выученных слов, книг и печати.\n\n" +
      "ТРИ УРОВНЯ\n\n" +
      "• Визуальный (по умолчанию) — кластеры и мерцающая сущность, без отдельных слов.\n" +
      "• Рабочий — клик по фрагменту: детали выбранной звезды и прямые связи (порции по 20, «Показать ещё»).\n" +
      "• Полный слепок — отдельная кнопка; JSON чанками с прогрессом/отменой для сущности и агента.\n\n" +
      "• Ctrl+0 — открыть зону; F1 — эта справка (вкладки уровней / управления).",
  },
  "lab.controls": {
    title: "ЛАБОРАТОРИЯ · УПРАВЛЕНИЕ",
    body:
      "Жесты карты знаний\n\n" +
      "• Ctrl+колёсико — зум точно к точке под курсором (точка неподвижна).\n" +
      "• Колёсико без Ctrl — как обычно (не зум карты).\n" +
      "• ЛКМ + перетаскивание — орбита 3D (yaw/pitch с ограничением).\n" +
      "• Короткий клик — выбор (не орбита): на визуальном — фрагмент; на рабочем — звезда и связи.\n" +
      "• 1∶1 / Ctrl+Home — сброс вида (не Ctrl+0 — он занят зоной).\n" +
      "• Tab / Shift+Tab в справке — уровни ↔ управление.",
  },
  settings: {
    title: "НАСТРОЙКИ",
    body:
      "Бортовые системы всего пульта.\n\n" +
      "• Язык интерфейса, звук, звёздное поле.\n" +
      "• Экипаж, скины, библиотека, читалка.\n\n" +
      "ГИД (Настройки → Гид)\n\n" +
      "• Выбор гида или «Без гида»; частота подсказок: часто / обычно / редко / выкл (только звания и сюжет).\n" +
      "• Голос вкл/выкл и громкость (▮…▮▮▮▮), «Прослушать» — образец.\n" +
      "• «Знакомство» — повторить первый диалог; «Сбросить» — снова рассказать о зонах и вернуть подсказки, скрытые через Shift+Esc.\n" +
      "• В окне гида: Enter / Пробел — дальше, Esc — закрыть, Shift+Esc — больше не показывать, V — голос.\n" +
      "• Tab / стрелки — по кнопкам, Enter — выбрать.",
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
  const [labHelpPage, setLabHelpPage] = useState<"lab" | "lab.controls">("lab");
  if (open && !wasOpen.current) lockedTab.current = tab;
  wasOpen.current = open;

  useEffect(() => {
    if (open) setLabHelpPage("lab");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (lockedTab.current === "lab" && e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        setLabHelpPage((p) => (e.shiftKey ? (p === "lab" ? "lab.controls" : "lab") : p === "lab" ? "lab.controls" : "lab"));
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
  const helpKey = lockedTab.current === "lab" ? labHelpPage : lockedTab.current;
  const page = PAGES[helpKey] || PAGES.bridge!;
  /* Скин-мир: что значат слова оболочки в текущем скине (voice pack `skin.help`). */
  const skinHelp = t("skin.help") !== "skin.help" ? t("skin.help") : "";

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
              <h2 className="route-title">{voiceLookup(`help.${lockedTab.current}`, getLang()) ?? page.title}</h2>
              <span className="muted help-how">{t("help_how")}</span>
            </div>
          </div>
          <button type="button" className="hud-btn amber" onClick={onClose}>
            {t("close")} Esc
          </button>
        </header>
        {lockedTab.current === "lab" ? (
          <div className="help-lab-tabs" data-nav-group="help-lab">
            <button
              type="button"
              className={`hud-btn ${labHelpPage === "lab" ? "amber" : ""}`}
              onClick={() => setLabHelpPage("lab")}
            >
              Уровни
            </button>
            <button
              type="button"
              className={`hud-btn ${labHelpPage === "lab.controls" ? "amber" : ""}`}
              onClick={() => setLabHelpPage("lab.controls")}
            >
              Управление
            </button>
          </div>
        ) : null}
        <div className="help-modal-body">
          {page.body.split("\n").map((line, i) =>
            line.trim() === "" ? <br key={i} /> : <p key={i}>{line}</p>,
          )}
          {lockedTab.current === "bridge" ? (
            <>
              <hr className="help-sep" />
              <p className="help-zen">{zt("help")}</p>
            </>
          ) : null}
          {lockedTab.current === "settings" ? (
            <>
              <hr className="help-sep" />
              <p className="help-idle">{ti("help")}</p>
            </>
          ) : null}
          {skinHelp ? (
            <>
              <hr className="help-sep" />
              <p className="help-skin">{skinHelp}</p>
            </>
          ) : null}
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
