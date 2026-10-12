import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/** UI-ключи + stamina JSON (ключ = русская фраза). */
const UI: Record<string, Record<string, string>> = {
  ru: {
    bridge: "Мостик",
    reader: "2 языка",
    english: "Английский",
    speed: "Скорочтение",
    crew: "Экипаж",
    skins: "Скины",
    enroll: "Зачислить",
    login: "Войти",
    honor: "Доска почёта",
    reading: "ЧИТАЕТ…",
    listening: "СЛУШАЮ…",
    ready: "К ЗАПУСКУ ГОТОВ",
    flying: "● В ПОЛЁТЕ",
    pause: "❚❚ ПАУЗА",
    finish: "ФИНИШ",
    board: "На борт",
    again: "Заново",
    missions: "Миссии",
    load: "Загрузить",
    screen: "Экран",
    show: "Показать",
    voice: "Голос",
    mic: "Микрофон",
    paste_text: "Вставьте текст для набора…",
    status: "статус",
    accuracy: "точн.",
    errors: "ошибки",
    time: "время",
    progress: "прогресс",
    chars: "симв.",
    hint_bridge: "Esc — пауза · клик по иллюминатору — фокус · после финиша сессия уходит на сервер",
    hyperdrive: "Гипердрайв",
    schulte: "Шульте 5×5",
    start: "▶ Старт",
    sound_radio: "Звук / радио",
    click_test: "Тест щелчка",
    next_num: "Следующее число",
    result_saved: "Результат сохранён",
    api_ok: "API ok",
    pilot: "Пилот",
    sessions: "Сессии",
  },
  en: {
    bridge: "Bridge",
    reader: "Bilingual",
    english: "English",
    speed: "Speed-read",
    crew: "Crew",
    skins: "Skins",
    enroll: "Enroll",
    login: "Login",
    honor: "Honor board",
    reading: "READING…",
    listening: "LISTENING…",
    ready: "READY TO LAUNCH",
    flying: "● IN FLIGHT",
    pause: "❚❚ PAUSED",
    finish: "FINISH",
    board: "Load",
    again: "Restart",
    missions: "Missions",
    load: "Load",
    screen: "Screen",
    show: "Reveal",
    voice: "Voice",
    mic: "Mic",
    paste_text: "Paste text to type…",
    status: "status",
    accuracy: "acc.",
    errors: "errors",
    time: "time",
    progress: "progress",
    chars: "chars",
    hint_bridge: "Esc — pause · click viewport to focus · session saves on finish",
    hyperdrive: "Hyperdrive",
    schulte: "Schulte 5×5",
    start: "▶ Start",
    sound_radio: "Sound / radio",
    click_test: "Click test",
    next_num: "Next number",
    result_saved: "Result saved",
    api_ok: "API ok",
    pilot: "Pilot",
    sessions: "Sessions",
  },
  uk: {
    bridge: "Місток",
    reader: "2 мови",
    english: "Англійська",
    speed: "Швидкочитання",
    crew: "Екіпаж",
    skins: "Скіни",
    enroll: "Зарахувати",
    login: "Увійти",
    honor: "Дошка пошани",
    reading: "ЧИТАЄ…",
    listening: "СЛУХАЮ…",
    ready: "ДО СТАРТУ ГОТОВИЙ",
    flying: "● У ПОЛЬОТІ",
    pause: "❚❚ ПАУЗА",
    finish: "ФІНІШ",
    board: "На борт",
    again: "Знову",
    missions: "Місії",
    load: "Завантажити",
    screen: "Екран",
    show: "Показати",
    voice: "Голос",
    mic: "Мікрофон",
    paste_text: "Вставте текст для набору…",
    status: "статус",
    accuracy: "точн.",
    errors: "помилки",
    time: "час",
    progress: "прогрес",
    chars: "симв.",
    hint_bridge: "Esc — пауза · клік по ілюмінатору — фокус · після фінішу сесія на сервер",
    hyperdrive: "Гіпердрайв",
    schulte: "Шульте 5×5",
    start: "▶ Старт",
    sound_radio: "Звук / радіо",
    click_test: "Тест клацання",
    next_num: "Наступне число",
    result_saved: "Результат збережено",
    api_ok: "API ok",
    pilot: "Пілот",
    sessions: "Сесії",
  },
  de: {
    bridge: "Brücke",
    reader: "Zweisprachig",
    english: "Englisch",
    speed: "Schnelllesen",
    crew: "Crew",
    skins: "Skins",
    enroll: "Anmelden",
    login: "Login",
    honor: "Ehrenliste",
    reading: "LIEST…",
    listening: "HÖRT…",
    ready: "STARTBEREIT",
    flying: "● IM FLUG",
    pause: "❚❚ PAUSE",
    finish: "ZIEL",
    board: "Laden",
    again: "Neu",
    missions: "Missionen",
    load: "Laden",
    screen: "Bildschirm",
    show: "Zeigen",
    voice: "Stimme",
    mic: "Mikro",
    paste_text: "Text zum Tippen einfügen…",
    status: "Status",
    accuracy: "Genau.",
    errors: "Fehler",
    time: "Zeit",
    progress: "Fortschritt",
    chars: "Zchn.",
    hint_bridge: "Esc — Pause · Klick fokussiert · Sitzung speichert am Ziel",
    hyperdrive: "Hyperantrieb",
    schulte: "Schulte 5×5",
    start: "▶ Start",
    sound_radio: "Ton / Radio",
    click_test: "Klick-Test",
    next_num: "Nächste Zahl",
    result_saved: "Ergebnis gespeichert",
    api_ok: "API ok",
    pilot: "Pilot",
    sessions: "Sitzungen",
  },
};

async function loadStaminaTable(lang: string): Promise<Record<string, string>> {
  try {
    const r = await fetch(`/locales/${lang}.json`);
    if (!r.ok) return {};
    return (await r.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function initI18n(lang = localStorage.getItem("st_lang") || "ru") {
  const stamina = await loadStaminaTable(lang);
  await i18n.use(initReactI18next).init({
    lng: lang,
    fallbackLng: "en",
    resources: {
      [lang]: {
        ui: UI[lang] || UI.en,
        stamina,
      },
    },
    defaultNS: "ui",
    interpolation: { escapeValue: false },
  });

  for (const code of Object.keys(UI)) {
    if (code === lang) continue;
    i18n.addResourceBundle(code, "ui", UI[code], true, true);
  }
  return i18n;
}

export async function switchAppLang(code: string) {
  localStorage.setItem("st_lang", code);
  if (!i18n.hasResourceBundle(code, "stamina")) {
    const stamina = await loadStaminaTable(code);
    i18n.addResourceBundle(code, "stamina", stamina, true, true);
  }
  if (!i18n.hasResourceBundle(code, "ui")) {
    i18n.addResourceBundle(code, "ui", UI[code] || UI.en, true, true);
  }
  await i18n.changeLanguage(code);
}

export { i18n };
