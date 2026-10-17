/** Настройки простоя (S8 E2): слайдшоу и радио по скину. Хранятся в браузере. */
import { create } from "zustand";

export type IdleAfter = "keep" | "stop";
export type IdleProvider = "auto" | "wikimedia" | "unsplash";
export type IdleSettings = { minutes: number; radio: boolean; after: IdleAfter; provider: IdleProvider };

/** Как desktop IDLE_MINUTES — выкл / 1 / 3 / 5 мин (+ «Показать сейчас» в UI). */
export const IDLE_MINUTES = [0, 1, 3, 5];
const KEY = "st_idle_settings";
export const IDLE_DEFAULTS: IdleSettings = { minutes: 3, radio: true, after: "stop", provider: "auto" };

function load(): IdleSettings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "{}");
    const s = { ...IDLE_DEFAULTS, ...j } as IdleSettings;
    /* старые 10/15 → 5, как desktop settings_of */
    if (s.minutes > 5) s.minutes = 5;
    if (!IDLE_MINUTES.includes(s.minutes)) s.minutes = IDLE_DEFAULTS.minutes;
    return s;
  } catch {
    return { ...IDLE_DEFAULTS };
  }
}

type St = IdleSettings & { set: <K extends keyof IdleSettings>(k: K, v: IdleSettings[K]) => void };

export const useIdle = create<St>((set, get) => ({
  ...load(),
  set: (k, v) => {
    set({ [k]: v } as Partial<St>);
    const { minutes, radio, after, provider } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ minutes, radio, after, provider }));
    } catch {
      /* ignore */
    }
  },
}));
