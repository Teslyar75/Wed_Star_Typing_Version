/** Настройки СИСТЕМ — как stamina/storage.DEFAULT_SETTINGS. */
import { create } from "zustand";

export type FontSize = "S" | "M" | "L" | "XL" | "XXL";
export type UiScale = "S" | "M" | "L" | "XL" | "XXL";
export type GlowLevel = "off" | "low" | "med" | "high";
export type UplinkTarget = "" | "ru" | "uk" | "en" | "de";
export type TypingFace = "mono" | "sans" | "serif" | "system";
/** Мигание целевой буквы в строке набора. */
export type CursorBlink = "off" | "on" | "fast";

export type CabinSettings = {
  sound: boolean;
  volume: 1 | 2 | 3 | 4;
  translator: boolean;
  uplinkTarget: UplinkTarget;
  stars: boolean;
  keyboard: boolean;
  zones: boolean;
  /** Прицел-крест (true) или подчёркивание текущей буквы (false). */
  sight: boolean;
  font: FontSize;
  /** Размер уже набранного текста (слева от курсора). */
  typedFont: FontSize;
  /** Размер текста впереди (справа от курсора). */
  aheadFont: FontSize;
  typedColor: string;
  aheadColor: string;
  typingFace: TypingFace;
  /** Размер слова в блоке прицела (sight-box / uplink). */
  sightBoxFont: FontSize;
  /** Семейство шрифта слова в sight-box. */
  sightBoxFace: TypingFace;
  /** Цвет буквы, которую нужно набрать сейчас (.sight-ch.on). */
  sightOnColor: string;
  /** Размер буквы под курсором (.cursor.sight-*). */
  cursorFont: FontSize;
  /** Цвет буквы под курсором. */
  cursorColor: string;
  /** Мигание целевой буквы: выкл / обычно / быстро. */
  cursorBlink: CursorBlink;
  uiScale: UiScale;
  glow: GlowLevel;
};

const KEY = "st_cabin_settings";

const DEFAULTS: CabinSettings = {
  sound: true,
  volume: 3,
  translator: true,
  uplinkTarget: "",
  stars: true,
  keyboard: true,
  zones: true,
  sight: true,
  font: "M",
  typedFont: "M",
  aheadFont: "M",
  typedColor: "#4db8c7",
  aheadColor: "#e8eef5",
  typingFace: "mono",
  sightBoxFont: "L",
  sightBoxFace: "mono",
  sightOnColor: "#ff5c5c",
  cursorFont: "M",
  cursorColor: "#ffffff",
  cursorBlink: "on",
  uiScale: "M",
  glow: "med",
};

const CURSOR_BLINK: Record<CursorBlink, true> = { off: true, on: true, fast: true };

/** Как desktop UI_PRESETS + XXL для больших мониторов. */
const UI_SCALE: Record<UiScale, string> = {
  S: "0.90",
  M: "1",
  L: "1.18",
  XL: "1.40",
  XXL: "1.70",
};

/** Размер букв в иллюминаторе / строке набора. */
const FONT_PX: Record<FontSize, string> = {
  S: "1.05rem",
  M: "1.35rem",
  L: "1.75rem",
  XL: "2.2rem",
  XXL: "2.75rem",
};

const TYPING_FACE: Record<TypingFace, string> = {
  mono: '"Cascadia Mono", Consolas, "Courier New", monospace',
  sans: '"Bahnschrift", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  system: "system-ui, -apple-system, sans-serif",
};

/** CSS-токены свечения контура: blur / edge% / inner top% / inner side% (+ hover). */
const GLOW: Record<
  GlowLevel,
  { blur: string; edge: string; inT: string; inS: string; blurH: string; edgeH: string; inTH: string; inSH: string }
> = {
  off: {
    blur: "0px",
    edge: "0%",
    inT: "0%",
    inS: "0%",
    blurH: "0px",
    edgeH: "0%",
    inTH: "0%",
    inSH: "0%",
  },
  low: {
    blur: "0.6px",
    edge: "3%",
    inT: "1.2%",
    inS: "1%",
    blurH: "1px",
    edgeH: "5%",
    inTH: "2%",
    inSH: "1.5%",
  },
  med: {
    blur: "1.2px",
    edge: "7%",
    inT: "2.5%",
    inS: "2%",
    blurH: "2px",
    edgeH: "11%",
    inTH: "4.5%",
    inSH: "3.5%",
  },
  high: {
    blur: "2.2px",
    edge: "14%",
    inT: "6%",
    inS: "4.5%",
    blurH: "3.5px",
    edgeH: "20%",
    inTH: "10%",
    inSH: "7%",
  },
};

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function load(): CabinSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<CabinSettings>;
    const merged = { ...DEFAULTS, ...raw };
    if (!GLOW[merged.glow]) merged.glow = DEFAULTS.glow;
    if (!UI_SCALE[merged.uiScale]) merged.uiScale = DEFAULTS.uiScale;
    if (!FONT_PX[merged.font]) merged.font = DEFAULTS.font;
    if (!FONT_PX[merged.typedFont]) merged.typedFont = merged.font;
    if (!FONT_PX[merged.aheadFont]) merged.aheadFont = merged.font;
    if (!TYPING_FACE[merged.typingFace]) merged.typingFace = DEFAULTS.typingFace;
    if (!FONT_PX[merged.sightBoxFont]) merged.sightBoxFont = DEFAULTS.sightBoxFont;
    if (!TYPING_FACE[merged.sightBoxFace]) merged.sightBoxFace = DEFAULTS.sightBoxFace;
    if (!FONT_PX[merged.cursorFont]) merged.cursorFont = merged.aheadFont || DEFAULTS.cursorFont;
    if (!isHexColor(merged.typedColor)) merged.typedColor = DEFAULTS.typedColor;
    if (!isHexColor(merged.aheadColor)) merged.aheadColor = DEFAULTS.aheadColor;
    if (!isHexColor(merged.sightOnColor)) merged.sightOnColor = DEFAULTS.sightOnColor;
    if (!isHexColor(merged.cursorColor)) merged.cursorColor = DEFAULTS.cursorColor;
    if (!CURSOR_BLINK[merged.cursorBlink]) merged.cursorBlink = DEFAULTS.cursorBlink;
    if (typeof merged.sight !== "boolean") merged.sight = DEFAULTS.sight;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function snapshotOf(s: CabinSettings): CabinSettings {
  return {
    sound: s.sound,
    volume: s.volume,
    translator: s.translator,
    uplinkTarget: s.uplinkTarget,
    stars: s.stars,
    keyboard: s.keyboard,
    zones: s.zones,
    sight: s.sight,
    font: s.font,
    typedFont: s.typedFont,
    aheadFont: s.aheadFont,
    typedColor: s.typedColor,
    aheadColor: s.aheadColor,
    typingFace: s.typingFace,
    sightBoxFont: s.sightBoxFont,
    sightBoxFace: s.sightBoxFace,
    sightOnColor: s.sightOnColor,
    cursorFont: s.cursorFont,
    cursorColor: s.cursorColor,
    cursorBlink: s.cursorBlink,
    uiScale: s.uiScale,
    glow: s.glow,
  };
}

function applyDom(s: CabinSettings) {
  const root = document.documentElement;
  root.style.setProperty("--st-ui-scale", UI_SCALE[s.uiScale]);
  root.style.setProperty("--st-viewport-font", FONT_PX[s.font]);
  root.style.setProperty("--st-sight-typed-size", FONT_PX[s.typedFont]);
  root.style.setProperty("--st-sight-ahead-size", FONT_PX[s.aheadFont]);
  root.style.setProperty("--st-sight-typed-color", s.typedColor);
  root.style.setProperty("--st-sight-ahead-color", s.aheadColor);
  root.style.setProperty("--st-sight-face", TYPING_FACE[s.typingFace]);
  root.style.setProperty("--st-sight-box-size", FONT_PX[s.sightBoxFont]);
  root.style.setProperty("--st-sight-box-face", TYPING_FACE[s.sightBoxFace]);
  root.style.setProperty("--st-sight-on-color", s.sightOnColor);
  root.style.setProperty("--st-sight-cursor-size", FONT_PX[s.cursorFont]);
  root.style.setProperty("--st-sight-cursor-color", s.cursorColor);
  root.dataset.cursorBlink = s.cursorBlink;
  const g = GLOW[s.glow] ?? GLOW.med;
  root.style.setProperty("--st-glow-blur", g.blur);
  root.style.setProperty("--st-glow-edge", g.edge);
  root.style.setProperty("--st-glow-in-t", g.inT);
  root.style.setProperty("--st-glow-in-s", g.inS);
  root.style.setProperty("--st-glow-blur-hover", g.blurH);
  root.style.setProperty("--st-glow-edge-hover", g.edgeH);
  root.style.setProperty("--st-glow-in-t-hover", g.inTH);
  root.style.setProperty("--st-glow-in-s-hover", g.inSH);
  if (s.glow === "off") {
    root.style.setProperty("--st-glow-filter", "none");
    root.style.setProperty("--st-glow-filter-hover", "none");
    root.style.setProperty("--st-glow-wash", "0");
  } else {
    root.style.removeProperty("--st-glow-filter");
    root.style.removeProperty("--st-glow-filter-hover");
    root.style.setProperty("--st-glow-wash", "1");
  }
  root.dataset.uiScale = s.uiScale;
  root.dataset.font = s.font;
  root.dataset.glow = s.glow;
  root.dataset.sight = s.sight ? "crosshair" : "underline";
  root.classList.toggle("glow-off", s.glow === "off");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("st-cabin-change"));
  }
}

type CabinState = CabinSettings & {
  set: <K extends keyof CabinSettings>(key: K, value: CabinSettings[K]) => void;
  toggle: (
    key: keyof Pick<CabinSettings, "sound" | "translator" | "stars" | "keyboard" | "zones" | "sight">,
  ) => void;
  hydrate: () => void;
};

export const useCabin = create<CabinState>((set, get) => {
  const initial = typeof localStorage !== "undefined" ? load() : { ...DEFAULTS };
  if (typeof document !== "undefined") applyDom(initial);

  return {
    ...initial,

    set: (key, value) => {
      const next = { ...get(), [key]: value } as CabinState;
      // Старый «размер строки» синхронизирует оба блока, если крутят его.
      if (key === "font") {
        next.typedFont = value as FontSize;
        next.aheadFont = value as FontSize;
      }
      const snapshot = snapshotOf(next);
      localStorage.setItem(KEY, JSON.stringify(snapshot));
      applyDom(snapshot);
      set(snapshot);
    },

    toggle: (key) => {
      get().set(key, !get()[key] as never);
    },

    hydrate: () => {
      const s = load();
      applyDom(s);
      set(s);
    },
  };
});

export { FONT_PX, UI_SCALE, GLOW, TYPING_FACE, DEFAULTS };
