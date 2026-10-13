/** Нормы и формат таймера — паритет stamina/speedread/exercises.py */

/** Пороги ★★★/★★/★ в секундах для N×N (база 5×5: 35/50/70). */
export function schulteNorm(n: number): [number, number, number] {
  const k = (n * n) / 25;
  return [35 * k, 50 * k, 70 * k];
}

/** Горбов: те же пороги ×1.7 */
export function gorbovNorm(n: number): [number, number, number] {
  const [a, b, c] = schulteNorm(n);
  return [a * 1.7, b * 1.7, c * 1.7];
}

export function starsFor(value: number, thresholds: [number, number, number], lowerIsBetter = true): number {
  const [a, b, c] = thresholds;
  if (lowerIsBetter) {
    if (value <= a) return 3;
    if (value <= b) return 2;
    if (value <= c) return 1;
    return 0;
  }
  if (value >= a) return 3;
  if (value >= b) return 2;
  if (value >= c) return 1;
  return 0;
}

/** MM:SS.s как fmt_s на десктопе */
export function fmtS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

const BEST_KEY = "st_ex_best";

type BestMap = Record<string, Record<string, { best: number }>>;

function loadBest(): BestMap {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || "{}") as BestMap;
  } catch {
    return {};
  }
}

export function getExBest(code: string, variant: string): number | null {
  const v = loadBest()[code]?.[variant]?.best;
  return typeof v === "number" && v > 0 ? v : null;
}

/** Сохранить лучшее. По умолчанию меньше — лучше (Шульте); для E-PYR/E-TAC — наоборот. */
export function saveExBest(
  code: string,
  variant: string,
  value: number,
  lowerIsBetter = true,
): boolean {
  const all = loadBest();
  const prev = all[code]?.[variant]?.best;
  const isRecord =
    prev == null || (lowerIsBetter ? value < prev : value > prev);
  if (isRecord) {
    if (!all[code]) all[code] = {};
    all[code]![variant] = { best: value };
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  }
  return isRecord;
}

export function loadExSize(key: "grb_n" | "shl_n", fallback = 5): number {
  try {
    const n = Number(localStorage.getItem(`st_${key}`));
    if (key === "grb_n" && (n === 5 || n === 7)) return n;
    if (key === "shl_n" && [3, 4, 5, 6, 7].includes(n)) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveExSize(key: "grb_n" | "shl_n", n: number) {
  localStorage.setItem(`st_${key}`, String(n));
}
