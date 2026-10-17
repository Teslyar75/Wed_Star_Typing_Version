/** Разбор голосовых команд Ориону (RU/EN). */

export type OrionCmd = "joke" | "radio_next" | "radio_prev" | "unknown";

export function parseOrionCommand(text: string): OrionCmd {
  const t = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "unknown";
  if (/шутк|анекдот|пошут|смешн|\bjoke\b|\bfunny\b/.test(t)) return "joke";
  if (/предыдущ|назад.*(волн|станц|ради)|prev(ious)?\s*(station|wave|radio)?/.test(t)) return "radio_prev";
  /* «смени волну» / «другую станцию» / next station */
  if (
    /(смени|смен|переключ|следующ|друг(ую|ая|ой)).*(волн|станц|ради)/.test(t) ||
    /(волн|станц|ради).*(смени|смен|переключ|следующ)/.test(t) ||
    /next\s*(station|wave|radio)?/.test(t) ||
    /change\s*(the\s*)?(station|wave|radio)/.test(t)
  ) {
    return "radio_next";
  }
  return "unknown";
}
