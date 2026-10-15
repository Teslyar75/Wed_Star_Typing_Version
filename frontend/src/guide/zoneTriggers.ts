/** G2: первый вход в зоны и подстраницы Мостика → триггер first_zone:<вкладка> + имя зоны из словаря скина. */
import { t } from "../i18n";

/** вкладка → ключ i18n её названия (у «Старой Англии» он переопределён голосовым пакетом). */
export const ZONE_NAME_KEY: Record<string, string> = {
  bridge: "bridge",
  missions: "missions",
  cargo: "own_text",
  log: "flight_log",
  bridgeSettings: "bridge_settings",
  english: "english",
  speed: "speed",
  lounge: "lounge",
  radio: "radio",
  settings: "settings",
};

export const ZONE_TRIGGERS = Object.keys(ZONE_NAME_KEY).map((k) => `first_zone:${k}`);

export function zoneTrigger(tab: string): string | null {
  return ZONE_NAME_KEY[tab] ? `first_zone:${tab}` : null;
}

export function zoneName(tab: string): string {
  return t(ZONE_NAME_KEY[tab] || tab);
}
