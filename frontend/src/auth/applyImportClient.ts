/** Часть переноса, которая живёт в браузере: настройки кабины, язык, свой текст, радио. */
import { useCabin, type CabinSettings } from "../settings/cabinStore";
import { saveCargoBoard } from "../cargo/processText";
import { setLang } from "../i18n";
import type { ImportClient } from "./CockpitEntry";

export function applyImportClient(c: ImportClient): void {
  if (c.cabin) {
    const st = useCabin.getState();
    for (const [k, v] of Object.entries(c.cabin)) {
      if (k in st) st.set(k as keyof CabinSettings, v as never);
    }
  }
  if (c.cargo?.text) {
    saveCargoBoard({
      text: c.cargo.text,
      original: c.cargo.original || c.cargo.text,
      index: c.cargo.index || 0,
      typed: c.cargo.typed,
      errors: c.cargo.errors,
      elapsed: c.cargo.elapsed,
    });
  }
  if (c.radio) {
    try {
      const key = "st_radio_prefs_import";
      localStorage.setItem(key, JSON.stringify(c.radio));
    } catch {
      /* ignore */
    }
  }
  if (c.lang) setLang(c.lang);
}
