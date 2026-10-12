import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/** stamina/i18n: ключ = русская фраза → перевод. Для web-UI ключей используем namespace `ui`. */
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

  // подгружаем остальные UI-словари сразу (маленькие)
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
