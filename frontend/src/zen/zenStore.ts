import { create } from "zustand";

export type ZenMode = "time" | "words" | "quote" | "zen" | "custom";
export type ZenPrefs = {
  mode: ZenMode;
  counts: { time: number; words: number; custom: number };
  punct: boolean;
  numbers: boolean;
  palette: "serika" | "skin";
};

export type ZenCarry = { index: number; typed: number; errors: number; elapsed: number };

export type BridgeHandle = {
  getText: () => string;
  getIndex: () => number;
  advanceTo: (index: number, extra: { typed: number; errors: number; elapsed: number }) => boolean;
  getLang: () => string;
};

const KEY = "st_zen";
const DEFAULT: ZenPrefs = {
  mode: "words",
  counts: { time: 30, words: 10, custom: 50 },
  punct: false,
  numbers: false,
  palette: "serika",
};

function loadPrefs(): { wanted: boolean; prefs: ZenPrefs } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { wanted: false, prefs: DEFAULT };
    const j = JSON.parse(raw) as { wanted?: boolean; prefs?: Partial<ZenPrefs> };
    return {
      wanted: !!j.wanted,
      prefs: {
        ...DEFAULT,
        ...j.prefs,
        counts: { ...DEFAULT.counts, ...(j.prefs?.counts || {}) },
      },
    };
  } catch {
    return { wanted: false, prefs: DEFAULT };
  }
}

function save(wanted: boolean, prefs: ZenPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ wanted, prefs }));
  } catch {
    /* ignore quota */
  }
}

const boot = loadPrefs();

type ZenState = {
  wanted: boolean;
  on: boolean;
  onBridge: boolean;
  prefs: ZenPrefs;
  bridge: BridgeHandle | null;
  setBridge: (h: BridgeHandle | null) => void;
  setOnBridge: (v: boolean) => void;
  toggle: () => void;
  close: () => void;
  setPrefs: (p: Partial<ZenPrefs> & { counts?: Partial<ZenPrefs["counts"]> }) => void;
};

function apply(s: Pick<ZenState, "wanted" | "onBridge">): boolean {
  return s.wanted && s.onBridge;
}

export const useZen = create<ZenState>((set, get) => ({
  wanted: boot.wanted,
  on: false,
  onBridge: false,
  prefs: boot.prefs,
  bridge: null,
  setBridge: (h) => set({ bridge: h }),
  setOnBridge: (v) => {
    const cur = get();
    const on = apply({ wanted: cur.wanted, onBridge: v });
    set({ onBridge: v, on });
  },
  toggle: () => {
    const cur = get();
    const wanted = !cur.wanted;
    const on = apply({ wanted, onBridge: cur.onBridge });
    save(wanted, cur.prefs);
    set({ wanted, on });
  },
  close: () => {
    const cur = get();
    save(false, cur.prefs);
    set({ wanted: false, on: false });
  },
  setPrefs: (p) => {
    const cur = get();
    const prefs: ZenPrefs = {
      ...cur.prefs,
      ...p,
      counts: { ...cur.prefs.counts, ...(p.counts || {}) },
    };
    save(cur.wanted, prefs);
    set({ prefs });
  },
}));
