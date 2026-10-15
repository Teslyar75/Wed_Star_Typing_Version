/** Зоны верхнего ряда и состав зоны «Мостик». См. docs/web/NAV_ZONES.md */
import type { Tab } from "./tabs";

export type ZoneId = "bridge" | "english" | "speed" | "lounge" | "radio" | "settings";

/** Порядок зон в шапке (Ctrl+1…6). */
export const ZONE_ORDER: ZoneId[] = [
  "bridge",
  "english",
  "speed",
  "lounge",
  "radio",
  "settings",
];

/** Подменю Мостика (не на верхнем ряду). */
export const BRIDGE_SUBTABS: Tab[] = ["missions", "cargo", "log", "bridgeSettings"];

export function zoneOf(tab: Tab): ZoneId {
  if (
    tab === "missions" ||
    tab === "cargo" ||
    tab === "log" ||
    tab === "bridgeSettings" ||
    tab === "bridge"
  ) {
    return "bridge";
  }
  return tab;
}

export function isBridgeZone(tab: Tab): boolean {
  return zoneOf(tab) === "bridge";
}

/** Клик по зоне в шапке: Мостик всегда «домой» на полёт. */
export function homeTabForZone(zone: ZoneId): Tab {
  return zone;
}
