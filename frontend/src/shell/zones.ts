/** Зоны верхнего ряда и состав зоны «Мостик». Канон — этот файл (NAV_ZONES.md в web-репо нет). */
import type { Tab } from "./tabs";

export type ZoneId = "bridge" | "english" | "speed" | "lounge" | "radio" | "orion" | "settings";

/** Следующие этапы — не в шапке, не в хоткеях. */
export const DEFERRED_ZONES = ["docs", "comm"] as const;

/** Порядок зон в шапке. Ctrl+1…N, N = длина массива (сейчас 7). */
export const ZONE_ORDER: ZoneId[] = [
  "bridge",
  "english",
  "speed",
  "lounge",
  "radio",
  "orion",
  "settings",
];

/** Ctrl/Cmd + цифра 1–9 → существующая зона; лишние цифры игнорируются. */
export function zoneFromDigit(digit: string): ZoneId | undefined {
  if (!/^[1-9]$/.test(digit)) return undefined;
  return ZONE_ORDER[Number(digit) - 1];
}

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
