/**
 * Порт stamina/translator.Segments — фрагменты для UPLINK.
 * Источник перевода = одно предложение оригинала (или чанк ~14 слов, если пунктуации нет).
 */

export const CHUNK_WORDS = 14;
export const MAX_SOURCE_CHARS = 900;

export type UplinkSeg = { start: number; end: number; source: string };

/** Как DEFAULT_PREP_OPTS: lower + punct + spaces. */
export function adaptForTyping(text: string): string {
  const t = (text || "")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return t;
}

const SENTENCE_SPLIT = /(?<=[.!?…])["'»”)\]]*\s+/;

function add(segs: UplinkSeg[], start: number, end: number, source: string) {
  segs.push({ start, end, source: source.slice(0, MAX_SOURCE_CHARS) });
}

function fromOriginal(adapted: string, original: string, words: string[], offsets: number[]): UplinkSeg[] | null {
  if (adaptForTyping(original) !== adapted) return null;
  const flat = original.split(/\s+/).join(" ");
  const sentences = flat.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 2 && words.length > CHUNK_WORDS * 2) return null;
  const counts = sentences.map((s) => adaptForTyping(s).split(/\s+/).filter(Boolean).length);
  if (counts.reduce((a, b) => a + b, 0) !== words.length) return null;

  const segs: UplinkSeg[] = [];
  let wi = 0;
  for (let i = 0; i < sentences.length; i++) {
    const n = counts[i]!;
    if (n === 0) continue;
    const start = offsets[wi]!;
    const last = wi + n - 1;
    const end = offsets[last]! + words[last]!.length;
    const sentence = sentences[i]!;
    if (n <= 2 && segs.length) {
      segs[segs.length - 1]!.end = end;
      segs[segs.length - 1]!.source = (segs[segs.length - 1]!.source + " " + sentence).slice(0, MAX_SOURCE_CHARS);
    } else {
      add(segs, start, end, sentence);
    }
    wi += n;
  }
  return segs.length ? segs : null;
}

/** Построить сегменты по адаптированному тексту набора (+ опционально оригинал с пунктуацией). */
export function buildUplinkSegments(adapted: string, original?: string | null): UplinkSeg[] {
  const words = adapted ? adapted.split(" ") : [];
  if (!words.length || (words.length === 1 && !words[0])) return [];
  const offsets: number[] = [];
  let pos = 0;
  for (const w of words) {
    offsets.push(pos);
    pos += w.length + 1;
  }
  if (original) {
    const fromOrig = fromOriginal(adapted, original, words, offsets);
    if (fromOrig) return fromOrig;
  }
  const segs: UplinkSeg[] = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    const chunk = words.slice(i, i + CHUNK_WORDS);
    const start = offsets[i]!;
    const joined = chunk.join(" ");
    add(segs, start, start + joined.length, joined);
  }
  return segs;
}

export function uplinkSegIndexAt(segs: UplinkSeg[], charIndex: number): number {
  if (!segs.length) return 0;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (segs[mid]!.start <= charIndex) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function uplinkSourceAt(segs: UplinkSeg[], charIndex: number): string {
  if (!segs.length) return "";
  return segs[uplinkSegIndexAt(segs, charIndex)]!.source;
}
