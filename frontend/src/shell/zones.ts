/** Зоны верхнего ряда и состав зоны «Мостик». Канон — этот файл (NAV_ZONES.md в web-репо нет). */
import type { Tab } from "./tabs";

export type ZoneId =
  | "bridge"
  | "english"
  | "speed"
  | "lounge"
  | "radio"
  | "comm"
  | "docs"
  | "orion"
  | "lab"
  | "settings";

/** Следующие этапы — не в шапке, не в хоткеях. */
export const DEFERRED_ZONES = [] as const;

/**
 * Порядок зон в шапке. Desktop: … orion → lab → settings.
 * Ctrl+1…9 нумеруют зоны без FIXED_HOTKEYS; lab = Ctrl+0 (settings остаётся Ctrl+9).
 */
export const ZONE_ORDER: ZoneId[] = [
  "bridge",
  "english",
  "speed",
  "lounge",
  "radio",
  "comm",
  "docs",
  "orion",
  "lab",
  "settings",
];

/** Постоянные хоткеи вне счёта 1…9 — как stamina/nav.FIXED_HOTKEYS. */
export const FIXED_HOTKEYS: Partial<Record<ZoneId, string>> = { lab: "0" };

/** Ctrl/Cmd + цифра → зона; «0» = lab; 1…9 без зон из FIXED_HOTKEYS. */
export function zoneFromDigit(digit: string): ZoneId | undefined {
  if (digit === "0") return FIXED_HOTKEYS.lab === "0" ? "lab" : undefined;
  if (!/^[1-9]$/.test(digit)) return undefined;
  const numbered = ZONE_ORDER.filter((z) => !(z in FIXED_HOTKEYS));
  return numbered[Number(digit) - 1];
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
