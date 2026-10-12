const DICT: Record<string, Record<string, string>> = {
  ru: {
    bridge: "Мостик",
    reader: "2 языка",
    english: "Английский",
    speed: "Скорочтение",
    crew: "Экипаж",
    skins: "Скины",
  },
  en: {
    bridge: "Bridge",
    reader: "Bilingual",
    english: "English",
    speed: "Speed-read",
    crew: "Crew",
    skins: "Skins",
  },
  uk: {
    bridge: "Місток",
    reader: "2 мови",
    english: "Англійська",
    speed: "Швидкочитання",
    crew: "Екіпаж",
    skins: "Скіни",
  },
  de: {
    bridge: "Brücke",
    reader: "Zweisprachig",
    english: "Englisch",
    speed: "Schnelllesen",
    crew: "Crew",
    skins: "Skins",
  },
};

let lang = localStorage.getItem("st_lang") || "ru";

export function getLang() {
  return lang;
}

export function setLang(code: string) {
  lang = code;
  localStorage.setItem("st_lang", code);
}

export function t(key: string): string {
  return DICT[lang]?.[key] ?? DICT.en?.[key] ?? key;
}
