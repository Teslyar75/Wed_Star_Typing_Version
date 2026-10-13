/** Настройки СИСТЕМ — как stamina/storage.DEFAULT_SETTINGS. */
import { create } from "zustand";

export type FontSize = "S" | "M" | "L" | "XL" | "XXL";
export type UiScale = "S" | "M" | "L" | "XL" | "XXL";
export type GlowLevel = "off" | "low" | "med" | "high";
export type UplinkTarget = "" | "ru" | "uk" | "en" | "de";

export type CabinSettings = {
  sound: boolean;
  volume: 1 | 2 | 3 | 4;
  translator: boolean;
  uplinkTarget: UplinkTarget;
  stars: boolean;
  keyboard: boolean;
  zones: boolean;
  font: FontSize;
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
  font: "M",
  uiScale: "M",
  glow: "med",
};

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

function load(): CabinSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<CabinSettings>;
    const merged = { ...DEFAULTS, ...raw };
    if (!GLOW[merged.glow]) merged.glow = DEFAULTS.glow;
    if (!UI_SCALE[merged.uiScale]) merged.uiScale = DEFAULTS.uiScale;
    if (!FONT_PX[merged.font]) merged.font = DEFAULTS.font;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function applyDom(s: CabinSettings) {
  const root = document.documentElement;
  root.style.setProperty("--st-ui-scale", UI_SCALE[s.uiScale]);
  root.style.setProperty("--st-viewport-font", FONT_PX[s.font]);
  const g = GLOW[s.glow] ?? GLOW.med;
  root.style.setProperty("--st-glow-blur", g.blur);
  root.style.setProperty("--st-glow-edge", g.edge);
  root.style.setProperty("--st-glow-in-t", g.inT);
  root.style.setProperty("--st-glow-in-s", g.inS);
  root.style.setProperty("--st-glow-blur-hover", g.blurH);
  root.style.setProperty("--st-glow-edge-hover", g.edgeH);
  root.style.setProperty("--st-glow-in-t-hover", g.inTH);
  root.style.setProperty("--st-glow-in-s-hover", g.inSH);
  // Выкл: полностью гасим filter (0px drop-shadow всё равно даёт «ореол» в части браузеров)
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
  root.classList.toggle("glow-off", s.glow === "off");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("st-cabin-change"));
  }
}

type CabinState = CabinSettings & {
  set: <K extends keyof CabinSettings>(key: K, value: CabinSettings[K]) => void;
  toggle: (key: keyof Pick<CabinSettings, "sound" | "translator" | "stars" | "keyboard" | "zones">) => void;
  hydrate: () => void;
};

export const useCabin = create<CabinState>((set, get) => {
  const initial = typeof localStorage !== "undefined" ? load() : { ...DEFAULTS };
  if (typeof document !== "undefined") applyDom(initial);

  return {
    ...initial,

    set: (key, value) => {
      const next = { ...get(), [key]: value } as CabinState;
      const snapshot: CabinSettings = {
        sound: next.sound,
        volume: next.volume,
        translator: next.translator,
        uplinkTarget: next.uplinkTarget,
        stars: next.stars,
        keyboard: next.keyboard,
        zones: next.zones,
        font: next.font,
        uiScale: next.uiScale,
        glow: next.glow,
      };
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

export { FONT_PX, UI_SCALE, GLOW };
