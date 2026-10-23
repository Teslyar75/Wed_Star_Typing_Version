/** Строки портала (ru/uk/en/de). Подписи режимов — как у Monkeytype (английские). */
import { getLang } from "../i18n";

const S: Record<string, Record<string, string>> = {
  ru: {
    enter: "◯ ПОРТАЛ", enter_title: "Портал: экран в стиле Monkeytype (Ctrl+M)", back: "⟵ на борт",
    restart_hint: "перезапуск", back_hint: "на борт", custom_prompt: "Своё число (5–1000):",
    mt_prompt: "Ваш ник на Monkeytype (только чтение прогресса; пусто — пропустить):",
    account: "Таблица прогресса", all: "Общая", ours: "Star Typing", mt: "Monkeytype",
    no_data: "Пока нет данных", synced: "Monkeytype обновлён", sync_err: "Monkeytype недоступен",
    tooltip_day: "{0}: Star Typing {1} · Monkeytype {2}", joined: "С нами с", streak: "Серия", days: "дн.",
    tests_started: "тестов начато", tests_done: "тестов пройдено", time_typing: "время набора",
    caret: "каретка", change_user: "сменить ник Monkeytype", close: "закрыть",
    help: "Портал (Ctrl+M или «◯ ПОРТАЛ»): экран как у Monkeytype — тема serika dark, Roboto Mono, режимы time/words/quote/zen/custom, 10/25/50/100 или 15/30/60/120, ⚒ — своё число 5–1000. Слова берутся с текущего места мостика, набранное верно продвигает мостик дальше. Формулы WPM/raw/acc/consistency — как у Monkeytype, таймер с первой клавиши. Пробел — к следующему слову; Backspace/Ctrl+Backspace — в пределах слова, назад только в слово с ошибкой. Esc или Tab+Enter — заново; двойной Esc, Ctrl+M или «⟵ на борт» — назад. Клик по нику — таблица прогресса: наши результаты в приоритете, прогресс Monkeytype подтягивается сам (только чтение).",
  },
  uk: {
    enter: "◯ ПОРТАЛ", enter_title: "Портал: екран у стилі Monkeytype (Ctrl+M)", back: "⟵ на борт",
    restart_hint: "перезапуск", back_hint: "на борт", custom_prompt: "Своє число (5–1000):",
    mt_prompt: "Ваш нік на Monkeytype (лише читання прогресу; порожньо — пропустити):",
    account: "Таблиця прогресу", all: "Загальна", ours: "Star Typing", mt: "Monkeytype",
    no_data: "Поки немає даних", synced: "Monkeytype оновлено", sync_err: "Monkeytype недоступний",
    tooltip_day: "{0}: Star Typing {1} · Monkeytype {2}", joined: "З нами з", streak: "Серія", days: "дн.",
    tests_started: "тестів розпочато", tests_done: "тестів пройдено", time_typing: "час набору",
    caret: "каретка", change_user: "змінити нік Monkeytype", close: "закрити",
    help: "Портал (Ctrl+M або «◯ ПОРТАЛ»): екран як у Monkeytype — тема serika dark, Roboto Mono, режими time/words/quote/zen/custom, 10/25/50/100 або 15/30/60/120, ⚒ — своє число 5–1000. Слова беруться з поточного місця містка, правильно набране просуває місток далі. Формули WPM/raw/acc/consistency — як у Monkeytype, таймер з першої клавіші. Пробіл — до наступного слова; Backspace/Ctrl+Backspace — у межах слова, назад лише в слово з помилкою. Esc або Tab+Enter — заново; подвійний Esc, Ctrl+M або «⟵ на борт» — назад. Клік по ніку — таблиця прогресу: наші результати в пріоритеті, прогрес Monkeytype підтягується сам (лише читання).",
  },
  en: {
    enter: "◯ PORTAL", enter_title: "Portal: Monkeytype-style screen (Ctrl+M)", back: "⟵ aboard",
    restart_hint: "restart test", back_hint: "back aboard", custom_prompt: "Custom amount (5–1000):",
    mt_prompt: "Your Monkeytype username (read-only progress; empty — skip):",
    account: "Progress table", all: "Combined", ours: "Star Typing", mt: "Monkeytype",
    no_data: "No data yet", synced: "Monkeytype synced", sync_err: "Monkeytype unavailable",
    tooltip_day: "{0}: Star Typing {1} · Monkeytype {2}", joined: "Joined", streak: "Current streak", days: "days",
    tests_started: "tests started", tests_done: "tests completed", time_typing: "time typing",
    caret: "caret", change_user: "change Monkeytype username", close: "close",
    help: "Portal (Ctrl+M or «◯ PORTAL»): a Monkeytype-like screen — serika dark, Roboto Mono, time/words/quote/zen/custom, 10/25/50/100 or 15/30/60/120, ⚒ — custom 5–1000. Words come from the current bridge position; correctly typed text advances the bridge. WPM/raw/acc/consistency use Monkeytype formulas, timer starts on first key. Space — next word; Backspace/Ctrl+Backspace within a word, going back only into a wrong word. Esc or Tab+Enter — restart; double Esc, Ctrl+M or «⟵ aboard» — return. Click the username for the progress table: our results take priority, Monkeytype progress syncs automatically (read-only).",
  },
  de: {
    enter: "◯ PORTAL", enter_title: "Portal: Bildschirm im Monkeytype-Stil (Strg+M)", back: "⟵ an Bord",
    restart_hint: "Neustart", back_hint: "an Bord", custom_prompt: "Eigene Anzahl (5–1000):",
    mt_prompt: "Dein Monkeytype-Name (Fortschritt nur lesen; leer — überspringen):",
    account: "Fortschrittstabelle", all: "Gesamt", ours: "Star Typing", mt: "Monkeytype",
    no_data: "Noch keine Daten", synced: "Monkeytype aktualisiert", sync_err: "Monkeytype nicht erreichbar",
    tooltip_day: "{0}: Star Typing {1} · Monkeytype {2}", joined: "Dabei seit", streak: "Serie", days: "Tage",
    tests_started: "Tests begonnen", tests_done: "Tests abgeschlossen", time_typing: "Tippzeit",
    caret: "Cursor", change_user: "Monkeytype-Namen ändern", close: "schließen",
    help: "Portal (Strg+M oder «◯ PORTAL»): Bildschirm wie bei Monkeytype — serika dark, Roboto Mono, time/words/quote/zen/custom, 10/25/50/100 oder 15/30/60/120, ⚒ — eigene Zahl 5–1000. Die Wörter kommen von der aktuellen Brückenposition; richtig Getipptes rückt die Brücke vor. WPM/raw/acc/consistency nach Monkeytype-Formeln, Timer ab erster Taste. Leertaste — nächstes Wort; Backspace/Strg+Backspace im Wort, zurück nur in ein falsches Wort. Esc oder Tab+Enter — neu; doppeltes Esc, Strg+M oder «⟵ an Bord» — zurück. Klick auf den Namen — Fortschrittstabelle: unsere Ergebnisse haben Vorrang, Monkeytype wird automatisch (nur lesend) geladen.",
  },
};

export function zt(key: string, ...args: (string | number)[]): string {
  const l = (getLang() || "ru").slice(0, 2);
  let s = S[l]?.[key] ?? S.en![key] ?? key;
  args.forEach((a, i) => (s = s.replace(`{${i}}`, String(a))));
  return s;
}
export const ZEN_LANGS = Object.keys(S);
export const zenKeys = (l: string) => Object.keys(S[l] || {});
