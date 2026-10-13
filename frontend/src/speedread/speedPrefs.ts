/** Настройки разгона / показа / книги (порт stamina/speedread/store.py defaults). */

export type RampMode = "smooth" | "steps" | "off";
export type BookMode = "page" | "spread" | "scroll" | "bilingual";
export type BookTheme = "paper" | "night" | "sepia";

export type SpeedPrefs = {
  start: number;
  target: number;
  step: number;
  everyS: number;
  mode: RampMode;
  punctPauses: boolean;
  wordsPerFrame: number;
  fontPt: number;
  orp: boolean;
  guides: boolean;
  translate: boolean;
  bookFontPt: number;
  bookMode: BookMode;
  bookTheme: BookTheme;
};

const PREFS_KEY = "st_speed_prefs";
const LAST_WPM_KEY = "st_speed_last_wpm";

export const DEFAULT_SPEED_PREFS: SpeedPrefs = {
  start: 300,
  target: 600,
  step: 10,
  everyS: 30,
  mode: "smooth",
  punctPauses: true,
  wordsPerFrame: 1,
  fontPt: 50,
  orp: true,
  guides: true,
  translate: true,
  bookFontPt: 17,
  bookMode: "spread",
  bookTheme: "sepia",
};

function clamp(n: number, lo: number, hi: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

/** Миграция со старого ключа `st_speed_ramp`. */
export function loadSpeedPrefs(): SpeedPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const legacy = !raw ? localStorage.getItem("st_speed_ramp") : null;
    const j = JSON.parse(raw || legacy || "{}") as Record<string, unknown>;
    const mode =
      j.mode === "steps" || j.mode === "off" || j.mode === "smooth"
        ? j.mode
        : DEFAULT_SPEED_PREFS.mode;
    const bookMode =
      j.bookMode === "page" ||
      j.bookMode === "spread" ||
      j.bookMode === "scroll" ||
      j.bookMode === "bilingual"
        ? j.bookMode
        : DEFAULT_SPEED_PREFS.bookMode;
    const bookTheme =
      j.bookTheme === "paper" || j.bookTheme === "night" || j.bookTheme === "sepia"
        ? j.bookTheme
        : DEFAULT_SPEED_PREFS.bookTheme;
    return {
      start: clamp(Number(j.start), 100, 1500, DEFAULT_SPEED_PREFS.start),
      target: clamp(Number(j.target), 150, 2000, DEFAULT_SPEED_PREFS.target),
      step: clamp(Number(j.step), 5, 100, DEFAULT_SPEED_PREFS.step),
      everyS: clamp(Number(j.everyS), 10, 300, DEFAULT_SPEED_PREFS.everyS),
      mode,
      punctPauses: j.punctPauses === undefined ? true : Boolean(j.punctPauses),
      wordsPerFrame: clamp(Number(j.wordsPerFrame), 1, 5, DEFAULT_SPEED_PREFS.wordsPerFrame),
      fontPt: clamp(Number(j.fontPt), 22, 72, DEFAULT_SPEED_PREFS.fontPt),
      orp: j.orp === undefined ? true : Boolean(j.orp),
      guides: j.guides === undefined ? true : Boolean(j.guides),
      translate: j.translate === undefined ? true : Boolean(j.translate),
      bookFontPt: clamp(Number(j.bookFontPt), 12, 28, DEFAULT_SPEED_PREFS.bookFontPt),
      bookMode,
      bookTheme,
    };
  } catch {
    return { ...DEFAULT_SPEED_PREFS };
  }
}

export function saveSpeedPrefs(prefs: SpeedPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  /* совместимость со старым ключом */
  localStorage.setItem(
    "st_speed_ramp",
    JSON.stringify({
      start: prefs.start,
      target: prefs.target,
      step: prefs.step,
      everyS: prefs.everyS,
      mode: prefs.mode,
      wordsPerStep: 8,
    }),
  );
}

export function loadLastWpm(textId: number | null | undefined): number | null {
  if (textId == null) return null;
  try {
    const map = JSON.parse(localStorage.getItem(LAST_WPM_KEY) || "{}") as Record<string, number>;
    const v = map[String(textId)];
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastWpm(textId: number | null | undefined, wpm: number) {
  if (textId == null || !Number.isFinite(wpm)) return;
  try {
    const map = JSON.parse(localStorage.getItem(LAST_WPM_KEY) || "{}") as Record<string, number>;
    map[String(textId)] = Math.round(wpm);
    localStorage.setItem(LAST_WPM_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Старт полёта: last_wpm книги в коридоре [start … target], как desktop reader.py */
export function resolveStartWpm(prefs: SpeedPrefs, textId: number | null | undefined): number {
  const last = loadLastWpm(textId);
  if (last == null) return prefs.start;
  return Math.max(prefs.start, Math.min(last, prefs.target));
}
