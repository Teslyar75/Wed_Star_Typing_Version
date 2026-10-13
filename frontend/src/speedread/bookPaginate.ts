/** Постраничная нарезка plain-text для читалки «Книга» (порт идеи book_reader._paginate_*). */

export type BookMode = "page" | "spread" | "scroll" | "bilingual";
export type BookTheme = "paper" | "night" | "sepia";

const CHARS: Record<BookMode, number> = {
  page: 1400,
  spread: 1100,
  scroll: 999_999,
  bilingual: 900,
};

/** Абзацы → страницы по бюджету символов. */
export function paginateBookText(text: string, mode: BookMode): string[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  if (mode === "scroll") return [raw];

  const budget = CHARS[mode];
  const paras = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let buf = "";

  const flush = () => {
    if (!buf.trim()) return;
    pages.push(buf.trim());
    buf = "";
  };

  for (const para of paras) {
    const chunk = buf ? `${buf}\n\n${para}` : para;
    if (buf && chunk.length > budget) {
      flush();
      if (para.length > budget) {
        /* длинный абзац — режем по предложениям / кускам */
        let rest = para;
        while (rest.length > budget) {
          let cut = rest.lastIndexOf(" ", budget);
          if (cut < budget * 0.4) cut = budget;
          pages.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        buf = rest;
      } else {
        buf = para;
      }
    } else {
      buf = chunk;
    }
  }
  flush();
  return pages.length ? pages : [raw];
}

/** Оценка минут до конца при ~230 сл/мин (desktop WPM_ESTIMATE). */
export function etaMinutes(remainingWords: number, wpm = 230): number {
  return Math.max(1, Math.round(remainingWords / Math.max(60, wpm)));
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
