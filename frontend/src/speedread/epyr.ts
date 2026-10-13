/**
 * E-PYR Пирамида — паритет stamina/speedread/exercises.py PyramidEx.
 * 14 строк; ширина промежутка width=2+i*3; счёт = width+4 (6…45 зн.).
 */

export const PYR_ROWS = 14;
/** Пороги ★★★/★★/★: ширина поля (знаков), больше — лучше. */
export const PYR_NORM: [number, number, number] = [34, 24, 14];

export const ALPHABETS: Record<string, string> = {
  ru: "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ",
  uk: "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЮЯ",
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  de: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ",
};

export type PyrRow = { a: string; b: string; width: number };

function pickPair(abc: string): string {
  const i = Math.floor(Math.random() * abc.length);
  const j = Math.floor(Math.random() * abc.length);
  return `${abc[i]!}${abc[j]!}`;
}

/** Построить 14 строк как на десктопе. */
export function buildPyramidRows(lang = "ru"): PyrRow[] {
  const abc = ALPHABETS[lang] || ALPHABETS.ru!;
  const rows: PyrRow[] = [];
  for (let i = 0; i < PYR_ROWS; i++) {
    const width = 2 + i * 3;
    rows.push({ a: pickPair(abc), b: pickPair(abc), width });
  }
  return rows;
}

/** Ширина поля в знаках для выбранной строки (width + 4). */
export function pyrFieldWidth(row: PyrRow): number {
  return row.width + 4;
}

/**
 * @deprecated старый RSVP-стиль клина; оставлен для совместимости тестов.
 * Новый UI использует buildPyramidRows.
 */
export function buildPyramid(text: string, levels = 7): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return ["★"];
  const lines: string[] = [];
  let width = 3;
  let i = 0;
  for (let L = 0; L < levels; L++) {
    let chunk = "";
    while (chunk.length < width && i < clean.length) {
      chunk += clean[i]!;
      i += 1;
    }
    if (!chunk.trim()) chunk = clean.slice(0, width);
    lines.push(chunk.trim());
    width += 4;
    if (i >= clean.length) i = 0;
  }
  return lines;
}
