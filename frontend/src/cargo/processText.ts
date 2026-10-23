/** Порт stamina/text_processing.py — опции подготовки груза. */

const PUNCT = new Set(
  `!"#$%&()*+,-./:;<=>?@[\\]^_\`{|}~«»“”„‟‹›—–−…·•№§¶©®™`.split(""),
);

const TYPO: Record<string, string> = {
  "«": '"',
  "»": '"',
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "‹": "'",
  "›": "'",
  "—": "-",
  "–": "-",
  "−": "-",
  "…": "...",
  "\u00a0": " ",
  "\u202f": " ",
};

const UMLAUT: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
  é: "e",
  è: "e",
  ê: "e",
  á: "a",
  à: "a",
  ñ: "n",
  ł: "l",
  Ł: "L",
};

export type CargoOpts = {
  lower: boolean;
  punct: boolean;
  spaces: boolean;
  yo: boolean;
  translit: boolean;
  /** Не оставлять сросшиеся слова («fortyfive», «1984was») — словарная проверка на сервере. */
  glue: boolean;
};

export const DEFAULT_CARGO_OPTS: CargoOpts = {
  lower: true,
  punct: true,
  spaces: true,
  yo: false,
  translit: false,
  glue: true,
};

const UK_APOS = /(?<=[А-Яа-яЁёІіЇїЄєҐґ])['’ʼ](?=[А-Яа-яЁёІіЇїЄєҐґ])/g;

export function normalizeSpaces(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

const INNER_KEEP = new Set(["'", "\u2019", "\u02bc", "\u2010", "\u2011", "-"]);
const NUMBER_SEP = new Set([".", ",", "-", "/", ":", "\u2013", "\u2014"]);
const WORDISH = /[\p{L}\p{N}]/u;
const DIGIT = /\p{Nd}/u;
const DASH_RUN = /[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212]{2,}/g;
const LINE_HYPHEN = /(\p{L}+)[ \t]?[-\u00ad\u2010]\s*\r?\n\s*(\p{L}+)/gu;

/** Перенос на краю строки «сло-⏎во» → «слово» (сервер уточняет по словарю: «forty-five»). */
export function dehyphenate(text: string): string {
  if (!text.includes("\n")) return text;
  return text.replace(LINE_HYPHEN, "$1$2");
}

/**
 * Знак между буквами/цифрами → пробел (иначе слова срастаются: «distaste--this» → «distastethis»).
 * Дефис/апостроф внутри слова и разделитель в числе сохраняются.
 */
export function removePunctuation(text: string): string {
  const marked = dehyphenate(text).replace(UK_APOS, "\x01").replace(DASH_RUN, " ");
  const chars = Array.from(marked);
  let out = "";
  let prev = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (!PUNCT.has(ch)) {
      out += ch;
      prev = ch;
      continue;
    }
    const nxt = chars[i + 1] ?? "";
    const wp = prev === "\x01" || (prev !== "" && WORDISH.test(prev));
    const wn = nxt !== "" && WORDISH.test(nxt);
    let add = "";
    if (INNER_KEEP.has(ch) && wp && wn) add = ch;
    else if (NUMBER_SEP.has(ch) && DIGIT.test(prev) && DIGIT.test(nxt)) add = ch;
    else if (wp && wn) add = " ";
    if (add) {
      out += add;
      prev = add;
    }
  }
  return out.replace(/\x01/g, "'");
}

export function normalizeTypography(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = TYPO[ch] ?? ch;
    out += "\r\n\t\v\f".includes(mapped) ? " " : mapped;
  }
  return out;
}

function transliterate(text: string): string {
  let out = "";
  for (const ch of text) {
    out += UMLAUT[ch] ?? ch;
  }
  return out;
}

export function processText(text: string, opts: CargoOpts): string {
  let t = text;
  if (opts.yo) t = t.replace(/ё/g, "е").replace(/Ё/g, "Е");
  if (opts.translit) t = transliterate(t);
  t = dehyphenate(t);
  if (opts.lower && opts.punct && opts.spaces) {
    return normalizeSpaces(normalizeTypography(removePunctuation(t)).toLowerCase());
  }
  if (opts.punct) t = removePunctuation(t);
  t = normalizeTypography(t);
  if (opts.lower) t = t.toLowerCase();
  if (opts.spaces) return normalizeSpaces(t);
  return t.trim();
}

export function detectLangName(text: string): string {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (/[а-яёА-ЯЁ]/.test(ch)) cyr += 1;
    else if (/[a-zA-Z]/.test(ch)) lat += 1;
  }
  if (cyr === 0 && lat === 0) return "—";
  return cyr >= lat ? "русский" : "английский";
}

export function fmtInt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function fmtEta(chars: number, cpm = 150): string {
  const sec = Math.round((chars / Math.max(cpm, 30)) * 60);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const CARGO_BOARD_KEY = "st_cargo_board";
export const PENDING_CARGO_KEY = "st_pending_drill";

/**
 * Порт stamina/session_storage.SessionState + cargo.txt / cargo_original.txt.
 * Текст груза и позиция набора — в одном LS-ключе (веб).
 */
export type CargoBoard = {
  text: string;
  original: string;
  index: number;
  typed?: number;
  errors?: number;
  elapsed?: number;
  /** Книга с полки — для продолжения печати */
  textId?: number | null;
  title?: string;
};

/** Как SessionState.is_unfinished — есть что продолжать на мостике. */
export function isUnfinishedCargo(board: CargoBoard | null | undefined): board is CargoBoard {
  if (!board?.text) return false;
  const i = board.index ?? 0;
  return i >= 0 && i < board.text.length;
}

export function loadCargoBoard(): CargoBoard | null {
  try {
    const raw = localStorage.getItem(CARGO_BOARD_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as CargoBoard;
    if (!j?.text) return null;
    return j;
  } catch {
    return null;
  }
}

/** Незавершённая сессия груза — аналог load_session() + load_cargo(). */
export function loadTypingSession(): CargoBoard | null {
  const b = loadCargoBoard();
  return isUnfinishedCargo(b) ? b : null;
}

export function saveCargoBoard(board: CargoBoard) {
  localStorage.setItem(CARGO_BOARD_KEY, JSON.stringify(board));
}

/** Аналог clear_session() — сброс позиции; текст груза оставляем. */
export function clearTypingSession() {
  const b = loadCargoBoard();
  if (!b?.text) {
    localStorage.removeItem(CARGO_BOARD_KEY);
    return;
  }
  saveCargoBoard({ ...b, index: b.text.length, typed: b.typed ?? 0 });
}

export type GlueResult = { text: string; count: number; examples: string[]; saved?: boolean };

/** Подготовка «своего текста» сервером (словарный разбор склеек). При ошибке — локальный результат. */
export async function prepareOnServer(raw: string, opts: CargoOpts): Promise<GlueResult> {
  try {
    const r = await fetch("/api/texts/prepare-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: raw, opts }),
    });
    if (r.ok) return (await r.json()) as GlueResult;
  } catch {
    /* офлайн */
  }
  return { text: processText(raw, opts), count: 0, examples: [] };
}

/** «✦ Проверить ИИ»: разделить склейки в тексте на борту (и в книге с полки). */
export async function glueFixBoard(): Promise<GlueResult | null> {
  const board = loadCargoBoard();
  if (!board?.text) return null;
  const r = await fetch("/api/texts/glue-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text: board.text, text_id: board.textId ?? null }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = (await r.json()) as GlueResult & { fixes: [number, number, number][] };
  if (j.count > 0) {
    saveCargoBoard({ ...board, text: j.text, index: remapIndex(j.fixes, board.index ?? 0) });
  }
  return j;
}

/** Позиция курсора в старом тексте → в исправленном. */
export function remapIndex(fixes: [number, number, number][], index: number): number {
  let shift = 0;
  for (const [start, end, len] of fixes) {
    if (start >= index) break;
    if (end <= index) shift += len - (end - start);
    else return start + shift;
  }
  return index + shift;
}
