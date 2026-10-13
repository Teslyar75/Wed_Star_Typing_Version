/**
 * E-TAC Вспышка (тахистоскоп) — паритет stamina/speedread/exercises.py FlashEx.
 */

export const TAC_ROUNDS = 15;
export const TAC_START_MS = 300;
export const TAC_MIN_MS = 50;
export const TAC_MAX_MS = 1000;
export const TAC_PRE_MS = 800;
export const TAC_MAX_WORDS = 10;
/** Макс. слов в одном ряду рамки; дальше — перенос и рост в высоту. */
export const TAC_COLS = 3;

/** Геометрия рамок: ширина до 3 слов, высота = ceil(n/3) рядов. */
export function tacFrameGeom(nwords: number): {
  cols: number;
  rows: number;
  widthCh: number;
  minHeightEm: number;
} {
  const n = clampTacWords(nwords);
  const cols = Math.min(TAC_COLS, Math.max(1, n));
  const rows = Math.max(1, Math.ceil(n / TAC_COLS));
  return {
    cols,
    rows,
    widthCh: 8 + cols * 9,
    minHeightEm: 2.4 + (rows - 1) * 1.55,
  };
}

/** @deprecated use tacFrameGeom — ширина только по колонкам (≤3). */
export function tacFrameCh(nwords: number): number {
  return tacFrameGeom(nwords).widthCh;
}

/** Разбить слова на строки по TAC_COLS. */
export function wrapWordLines(words: string[], cols = TAC_COLS): string[] {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += cols) {
    lines.push(words.slice(i, i + cols).join(" "));
  }
  return lines.length ? lines : [""];
}

/** Текст вспышки / маски с переносами по 3 слова. */
export function formatFlashLines(answer: string, mask: boolean): string {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const cells = mask ? words.map((w) => "#".repeat(Math.max(3, w.length))) : words;
  return wrapWordLines(cells).join("\n");
}

/** Автоперенос ввода: каждые 3 слова — новая строка (без ручного Enter). */
export function formatInputWrap(raw: string, cols = TAC_COLS): string {
  const trailing = /\s$/.test(raw);
  const words = raw.replace(/\n/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return trailing ? " " : "";
  const text = wrapWordLines(words, cols).join("\n");
  return trailing ? `${text} ` : text;
}

export function flattenTyped(text: string): string {
  return text.toLowerCase().trim().split(/\s+/).filter(Boolean).join(" ");
}

export function clampTacWords(n: number): number {
  return Math.max(1, Math.min(TAC_MAX_WORDS, Math.round(n) || 1));
}

export function clampTacMs(ms: number): number {
  const step = Math.round((ms || TAC_START_MS) / 10) * 10;
  return Math.max(TAC_MIN_MS, Math.min(TAC_MAX_MS, step));
}

const CFG_KEY = "st_tac_cfg";

export function loadTacCfg(): { words: number; ms: number } {
  try {
    const j = JSON.parse(localStorage.getItem(CFG_KEY) || "{}") as { words?: number; ms?: number };
    return {
      words: clampTacWords(j.words ?? 1),
      ms: clampTacMs(j.ms ?? TAC_START_MS),
    };
  } catch {
    return { words: 1, ms: TAC_START_MS };
  }
}

export function saveTacCfg(words: number, ms: number) {
  localStorage.setItem(
    CFG_KEY,
    JSON.stringify({ words: clampTacWords(words), ms: clampTacMs(ms) }),
  );
}

export const FLASH_WORDS: Record<string, string> = {
  ru:
    "дом лес мир свет поле река небо окно море город книга время слово ветер звезда планета " +
    "корабль пилот ракета космос орбита сигнал радар",
  uk:
    "дім ліс світ поле річка небо вікно море місто книга час слово вітер зірка планета " +
    "корабель пілот ракета космос орбіта сигнал радар",
  en:
    "home tree world light field river sky window sea city book time word wind star planet " +
    "ship pilot rocket space orbit signal radar",
  de:
    "haus wald welt licht feld fluss himmel fenster meer stadt buch zeit wort wind stern " +
    "planet schiff pilot rakete raum umlauf signal radar straße größe",
};

/** Слова из текста книги (3–9 букв), иначе пул по языку. */
export function flashPool(text: string, lang = "ru"): string[] {
  const fromBook = text
    .toLowerCase()
    .match(/[^\W\d_](?:[^\W\d_]|['’](?=[^\W\d_])){2,8}/gu);
  if (fromBook && fromBook.length > 0) {
    return [...new Set(fromBook)];
  }
  const base = FLASH_WORDS[lang] || FLASH_WORDS.en!;
  return base.split(/\s+/).filter(Boolean);
}

export function pickFlashAnswer(pool: string[], nwords: number): string {
  const parts: string[] = [];
  for (let i = 0; i < nwords; i++) {
    parts.push(pool[Math.floor(Math.random() * pool.length)] || "word");
  }
  return parts.join(" ");
}

/** Лестница после ответа: новый ms / nwords / streak. */
export function ladderAfter(
  ok: boolean,
  ms: number,
  nwords: number,
  streak: number,
): { ms: number; nwords: number; streak: number } {
  if (ok) {
    let nextStreak = streak + 1;
    let nextMs = ms;
    let nextNw = nwords;
    if (nextStreak >= 3) {
      nextStreak = 0;
      if (nextMs > 60) {
        nextMs = Math.max(TAC_MIN_MS, nextMs - 20);
      } else if (nextNw < TAC_MAX_WORDS) {
        nextNw += 1;
        nextMs = 200;
      }
    }
    return { ms: nextMs, nwords: nextNw, streak: nextStreak };
  }
  return { ms: Math.min(TAC_MAX_MS, ms + 20), nwords, streak: 0 };
}

/** Буквы/цифры верного ответа (без пробелов) — база для баллов. */
export function countScoreChars(text: string): number {
  return flattenTyped(text).replace(/\s+/g, "").length;
}

/**
 * Баллы за верный раунд:
 * символы × число слов × (MAX_MS / ms) — чем короче вспышка и больше слов, тем выше.
 */
export function roundPoints(answer: string, nwords: number, ms: number): number {
  const chars = countScoreChars(answer);
  const nw = Math.max(1, nwords);
  const show = Math.max(TAC_MIN_MS, ms);
  const speed = Math.max(1, Math.round(TAC_MAX_MS / show));
  return chars * nw * speed;
}

/** Сводка сессии для рекорда (больше — лучше). */
export function flashScore(words: number, ms: number, points = 0): number {
  if (points > 0) return points;
  return words * 1000 - ms;
}

/** Звёзды по итогу сессии: баллы + число верных. */
export function flashStars(bestNw: number, bestMs: number, points = 0, ok = 0): number {
  if (points > 0) {
    if (ok >= 12 && points >= 1200) return 3;
    if (ok >= 8 && points >= 400) return 2;
    if (ok >= 4 || points >= 150) return 1;
    return 0;
  }
  if (bestNw >= 3 && bestMs <= 100) return 3;
  if (bestNw >= 2 || bestMs <= 100) return 2;
  if (bestMs <= 200) return 1;
  return 0;
}

/** Сравнение лучших (nw, −ms): больше лучше. */
export function isBetterFlash(
  nw: number,
  ms: number,
  prevNw: number | null,
  prevMs: number | null,
): boolean {
  if (prevNw == null || prevMs == null) return true;
  if (nw !== prevNw) return nw > prevNw;
  return ms < prevMs;
}
