/** Канон путей: RU-подпись + slug. См. docs/web/NAV_ZONES.md */
import type { Tab } from "./tabs";
import type { ZoneId } from "./zones";
import { zoneOf } from "./zones";

export type PathSeg = {
  slug: string;
  labelKey: string;
  tab?: Tab;
};

const ZONE_SEG: Record<ZoneId, PathSeg> = {
  bridge: { slug: "bridge", labelKey: "bridge", tab: "bridge" },
  english: { slug: "english", labelKey: "english", tab: "english" },
  speed: { slug: "speed", labelKey: "speed", tab: "speed" },
  lounge: { slug: "lounge", labelKey: "lounge", tab: "lounge" },
  radio: { slug: "radio", labelKey: "radio", tab: "radio" },
  settings: { slug: "settings", labelKey: "settings", tab: "settings" },
};

const BRIDGE_LEAF: Partial<Record<Tab, PathSeg>> = {
  missions: { slug: "missions", labelKey: "missions", tab: "missions" },
  cargo: { slug: "cargo", labelKey: "own_text", tab: "cargo" },
  log: { slug: "log", labelKey: "flight_log", tab: "log" },
  bridgeSettings: { slug: "settings", labelKey: "bridge_settings", tab: "bridgeSettings" },
};

/** Базовый путь зоны + лист мостика (без deep). */
export function basePathForTab(tab: Tab): PathSeg[] {
  const zone = zoneOf(tab);
  const root = ZONE_SEG[zone];
  if (zone === "bridge" && tab !== "bridge") {
    const leaf = BRIDGE_LEAF[tab];
    return leaf ? [root, leaf] : [root];
  }
  return [root];
}

export function slugPath(segs: { slug: string }[]): string {
  return segs.map((s) => s.slug).join("/");
}

/** Известные deep-slug страниц (для доков и валидации). */
export const EN_PAGES = [
  "overview",
  "sets",
  "scanner",
  "practice",
  "review",
  "warehouse",
  "book",
  "lists",
  "log",
  "settings",
] as const;

export const SR_PAGES = [
  "overview",
  "reader",
  "book",
  "trainers",
  "library",
  "journal",
  "settings",
] as const;

export const SR_MODALS = ["gutenberg", "bilingual", "pdf", "paste", "rename"] as const;

export const LOUNGE_PAGES = ["lobby", "tetris", "snake", "breakout"] as const;

export const RADIO_PAGES = ["air", "rx"] as const;

export const SETTINGS_PAGES = ["cabin", "cabinMore", "skins", "crew"] as const;

export const BRIDGE_MODALS = ["debrief"] as const;
