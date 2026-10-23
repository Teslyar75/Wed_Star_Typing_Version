/** Вариант интерфейса: «classic» (как было) или «alt» (Пульт-кабина, эталон — десктоп docs/ALT_UI.md).
 *  Хранится на пилота: st_ui_variant:<позывной>; без пилота — общий ключ st_ui_variant.
 *  Общий ключ меняет только явный выбор гостя (без пилота), а не последний вошедший пилот. */
import { create } from "zustand";

export type UiVariant = "classic" | "alt";
const KEY = "st_ui_variant";

export function readVariant(raw: string | null | undefined): UiVariant {
  return raw === "alt" ? "alt" : "classic";
}

export function variantKey(callsign?: string | null): string {
  const c = (callsign || "").trim().toLowerCase();
  return c ? `${KEY}:${c}` : KEY;
}

function apply(v: UiVariant) {
  if (typeof document !== "undefined") document.documentElement.dataset.uiVariant = v;
}

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function put(key: string, v: UiVariant) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

/** Вариант пилота (без пилота или без записи — общий). */
export function variantFor(callsign?: string | null): UiVariant {
  const own = callsign ? get(variantKey(callsign)) : null;
  return readVariant(own ?? get(KEY));
}

/** Запомнить вариант пилота (окно входа), не трогая текущий экран. */
export function storeVariantFor(callsign: string, v: UiVariant) {
  put(variantKey(callsign), v);
}

type S = {
  variant: UiVariant;
  pilot: string | null;
  setVariant: (v: UiVariant) => void;
  bindPilot: (callsign: string | null) => void;
};

export const useUiVariant = create<S>((set, getS) => {
  const v = variantFor(null);
  apply(v);
  return {
    variant: v,
    pilot: null,
    setVariant: (next) => {
      const p = getS().pilot;
      put(variantKey(p), next);
      apply(next);
      set({ variant: next });
    },
    bindPilot: (callsign) => {
      const c = callsign || null;
      const next = variantFor(c);
      apply(next);
      set({ pilot: c, variant: next });
    },
  };
});
