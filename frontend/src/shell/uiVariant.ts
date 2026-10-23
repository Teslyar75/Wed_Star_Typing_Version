/** Вариант интерфейса: «classic» (как было) или «alt» (Пульт-кабина, эталон — десктоп docs/ALT_UI.md). */
import { create } from "zustand";

export type UiVariant = "classic" | "alt";
const KEY = "st_ui_variant";

export function readVariant(raw: string | null | undefined): UiVariant {
  return raw === "alt" ? "alt" : "classic";
}

function apply(v: UiVariant) {
  if (typeof document !== "undefined") document.documentElement.dataset.uiVariant = v;
}

function load(): UiVariant {
  try {
    return readVariant(localStorage.getItem(KEY));
  } catch {
    return "classic";
  }
}

type S = { variant: UiVariant; setVariant: (v: UiVariant) => void };

export const useUiVariant = create<S>((set) => {
  const v = load();
  apply(v);
  return {
    variant: v,
    setVariant: (next) => {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      apply(next);
      set({ variant: next });
    },
  };
});
