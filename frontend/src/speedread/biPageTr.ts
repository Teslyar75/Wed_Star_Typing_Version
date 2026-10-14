/** Сопоставление перевода странице оригинала — порт book_reader._fixed_bilingual_paras. */

export type BiSeg = {
  original: string;
  translation: string;
  para_idx: number;
};

export function splitParas(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Абзацы оригинала/перевода из сегментов (по para_idx). */
export function parasFromSegments(segs: BiSeg[]): { orig: string[]; tr: string[] } {
  const byPara = new Map<number, { o: string[]; t: string[] }>();
  for (const s of segs) {
    const bucket = byPara.get(s.para_idx) ?? { o: [], t: [] };
    const o = (s.original || "").trim();
    const tr = (s.translation || "").trim();
    if (o) bucket.o.push(o);
    if (tr && tr !== "…") bucket.t.push(tr);
    byPara.set(s.para_idx, bucket);
  }
  const keys = [...byPara.keys()].sort((a, b) => a - b);
  return {
    orig: keys.map((k) => byPara.get(k)!.o.join(" ")),
    tr: keys.map((k) => byPara.get(k)!.t.join(" ")),
  };
}

/**
 * Правая колонка 2ЯЗ: столько же абзацев перевода, сколько на левой странице.
 * start — индекс первого абзаца левой страницы в книге.
 */
export function fixedBilingualRight(
  leftPlain: string,
  bookOrigParas: string[],
  bookTrParas: string[],
): string {
  if (!bookTrParas.length) return "";
  const leftParas = splitParas(leftPlain);
  const left = leftParas.length ? leftParas : leftPlain.trim() ? [leftPlain.trim()] : [];
  if (!left.length) return "";

  let start = 0;
  const head = left[0]!.replace(/\s+/g, " ").slice(0, 48);
  if (head && bookOrigParas.length) {
    const needle = head.slice(0, 32);
    for (let i = 0; i < bookOrigParas.length; i++) {
      const p = bookOrigParas[i]!.replace(/\s+/g, " ");
      if (p.startsWith(needle) || p.includes(needle)) {
        start = i;
        break;
      }
    }
  }
  const n = Math.max(1, left.length);
  let chunk = bookTrParas.slice(start, start + n).filter((p) => p.trim());
  if (!chunk.length && start < bookTrParas.length) {
    chunk = bookTrParas.slice(start, start + 1).filter((p) => p.trim());
  }
  return chunk.join("\n\n");
}

/**
 * Перевод страницы по сегментам: набираем оригиналы, пока не покроем левый текст.
 * Нужно, когда один EN-абзац = несколько коротких RU-сегментов.
 */
export function rightFromSegments(leftPlain: string, segs: BiSeg[]): string {
  const leftNorm = leftPlain.replace(/\s+/g, " ").trim();
  if (!leftNorm || !segs.length) return "";

  let start = -1;
  const head = leftNorm.slice(0, 36);
  for (let i = 0; i < segs.length; i++) {
    const o = (segs[i]!.original || "").replace(/\s+/g, " ").trim();
    if (o.length < 8) continue;
    const tip = o.slice(0, Math.min(28, o.length));
    if (leftNorm.startsWith(tip) || tip.startsWith(head.slice(0, Math.min(20, head.length)))) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    for (let i = 0; i < segs.length; i++) {
      const o = (segs[i]!.original || "").replace(/\s+/g, " ").trim();
      if (o.length >= 12 && leftNorm.includes(o.slice(0, 24))) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) start = 0;

  const target = leftNorm.length;
  let covered = 0;
  const trs: string[] = [];
  for (let i = start; i < segs.length; i++) {
    const o = (segs[i]!.original || "").replace(/\s+/g, " ").trim();
    const tr = (segs[i]!.translation || "").trim();
    if (!o) continue;
    if (covered > 0 && covered >= target * 0.9) break;
    covered += o.length + 1;
    if (tr && tr !== "…") trs.push(tr);
    if (covered >= target) break;
  }
  return trs.join("\n\n");
}
