/** Совместимый фасад над i18next (старые вызовы t/getLang/setLang). */
import { i18n, switchAppLang } from "./i18n/setup";
import { voiceLookup } from "./theme/voice";

export function getLang() {
  return i18n.language || localStorage.getItem("st_lang") || "ru";
}

export function setLang(code: string) {
  void switchAppLang(code);
}

export function onLangChange(fn: () => void): () => void {
  const handler = () => fn();
  i18n.on("languageChanged", handler);
  return () => {
    i18n.off("languageChanged", handler);
  };
}

export function t(key: string): string {
  // voice pack активного скина поверх базовых строк
  const v = voiceLookup(key, getLang());
  if (v !== undefined) return v;
  // сначала ui-ключ, иначе фраза из stamina (русский ключ)
  if (i18n.exists(key, { ns: "ui" })) return i18n.t(key, { ns: "ui" });
  if (i18n.exists(key, { ns: "stamina" })) return i18n.t(key, { ns: "stamina" });
  return i18n.t(key, { ns: "ui", defaultValue: key });
}
