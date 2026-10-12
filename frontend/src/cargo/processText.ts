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
};

export const DEFAULT_CARGO_OPTS: CargoOpts = {
  lower: true,
  punct: true,
  spaces: true,
  yo: false,
  translit: false,
};

const UK_APOS = /(?<=[А-Яа-яЁёІіЇїЄєҐґ])['’ʼ](?=[А-Яа-яЁёІіЇїЄєҐґ])/g;

export function normalizeSpaces(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

export function removePunctuation(text: string): string {
  const marked = text.replace(UK_APOS, "\x01");
  let out = "";
  for (const ch of marked) {
    out += PUNCT.has(ch) ? "" : ch;
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
  if (opts.lower && opts.punct && opts.spaces) {
    return normalizeSpaces(removePunctuation(normalizeTypography(t)).toLowerCase());
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

export type CargoBoard = {
  text: string;
  original: string;
  index: number;
};

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

export function saveCargoBoard(board: CargoBoard) {
  localStorage.setItem(CARGO_BOARD_KEY, JSON.stringify(board));
}
