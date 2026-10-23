/** Экраны отсека для меню «ОБЗОР ▾» (одна модель для шапки, как nav.path на десктопе). */
import type { Tab } from "./tabs";
import { zoneOf } from "./zones";

export type Screen = { tab: Tab; labelKey: string };

const BRIDGE: Screen[] = [
  { tab: "bridge", labelKey: "bridge" },
  { tab: "missions", labelKey: "missions" },
  { tab: "cargo", labelKey: "own_text" },
  { tab: "log", labelKey: "flight_log" },
  { tab: "bridgeSettings", labelKey: "bridge_settings" },
];

export function screensForTab(tab: Tab): Screen[] {
  const zone = zoneOf(tab);
  if (zone === "bridge") return BRIDGE;
  return [{ tab: zone as Tab, labelKey: zone }];
}

export function titleKeyForTab(tab: Tab): string {
  return screensForTab(tab).find((s) => s.tab === tab)?.labelKey ?? tab;
}
