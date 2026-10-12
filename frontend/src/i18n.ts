const DICT: Record<string, Record<string, string>> = {
  ru: {
    bridge: "Мостик",
    reader: "2 языка",
    english: "Английский",
    speed: "Скорочтение",
    crew: "Экипаж",
    skins: "Скины",
    ready: "К ЗАПУСКУ ГОТОВ",
    flying: "● В ПОЛЁТЕ",
    pause: "❚❚ ПАУЗА",
    finish: "ФИНИШ",
    board: "На борт",
    again: "Заново",
    enroll: "Зачислить",
    login: "Войти",
    honor: "Доска почёта",
    reading: "ЧИТАЕТ…",
    listening: "СЛУШАЮ…",
  },
  en: {
    bridge: "Bridge",
    reader: "Bilingual",
    english: "English",
    speed: "Speed-read",
    crew: "Crew",
    skins: "Skins",
    ready: "READY TO LAUNCH",
    flying: "● IN FLIGHT",
    pause: "❚❚ PAUSED",
    finish: "FINISH",
    board: "Load",
    again: "Restart",
    enroll: "Enroll",
    login: "Login",
    honor: "Honor board",
    reading: "READING…",
    listening: "LISTENING…",
  },
  uk: {
    bridge: "Місток",
    reader: "2 мови",
    english: "Англійська",
    speed: "Швидкочитання",
    crew: "Екіпаж",
    skins: "Скіни",
    ready: "ДО СТАРТУ ГОТОВИЙ",
    flying: "● У ПОЛЬОТІ",
    pause: "❚❚ ПАУЗА",
    finish: "ФІНІШ",
    board: "На борт",
    again: "Знову",
    enroll: "Зарахувати",
    login: "Увійти",
    honor: "Дошка пошани",
    reading: "ЧИТАЄ…",
    listening: "СЛУХАЮ…",
  },
  de: {
    bridge: "Brücke",
    reader: "Zweisprachig",
    english: "Englisch",
    speed: "Schnelllesen",
    crew: "Crew",
    skins: "Skins",
    ready: "STARTBEREIT",
    flying: "● IM FLUG",
    pause: "❚❚ PAUSE",
    finish: "ZIEL",
    board: "Laden",
    again: "Neu",
    enroll: "Anmelden",
    login: "Login",
    honor: "Ehrenliste",
    reading: "LIEST…",
    listening: "HÖRT…",
  },
};

let lang = localStorage.getItem("st_lang") || "ru";
const listeners = new Set<() => void>();

export function getLang() {
  return lang;
}

export function setLang(code: string) {
  lang = code;
  localStorage.setItem("st_lang", code);
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function t(key: string): string {
  return DICT[lang]?.[key] ?? DICT.en?.[key] ?? key;
}
