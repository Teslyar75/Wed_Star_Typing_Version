/**
 * Voice pack скина: словарь поверх i18n (ui-ключи и `entry.*`) + ранги мира.
 * Нет ключа в словаре скина → обычная строка (fallback). Логику тренировки не трогает.
 */
import { i18n } from "../i18n/setup";

export type VoiceDict = Record<string, Record<string, string>>;

/** Базовая лестница званий (= backend/app/pilots.py RANKS), ключ для перевода в мир скина. */
export const BASE_RANKS = [
  "Кадет",
  "Пилот-стажёр",
  "Мичман",
  "Лейтенант",
  "Капитан-лейтенант",
  "Капитан",
  "Коммодор",
  "Адмирал флота",
];

let voice: VoiceDict | null = null;
let ranks: Record<string, string[]> | null = null;

export function setSkinVoice(v: VoiceDict | null | undefined, r?: Record<string, string[]> | null): void {
  voice = v || null;
  ranks = r || null;
}

export function clearSkinVoice(): void {
  voice = null;
  ranks = null;
}

/** Строка скина или undefined (тогда вызывающий берёт базовую). */
export function voiceLookup(key: string, lang: string): string | undefined {
  if (!voice) return undefined;
  return voice[lang]?.[key];
}

/** Звание пилота в мире скина (по индексу базовой лестницы). */
export function skinRank(rank: string | undefined | null, lang: string): string {
  if (!rank) return "";
  if (!ranks) return rank;
  const i = BASE_RANKS.indexOf(rank);
  if (i < 0) return rank;
  const list = ranks[lang] || ranks.en || ranks.ru;
  return list?.[i] ?? rank;
}

/** Название миссии в мире скина (`mission.<num>`), иначе с сервера. */
export function missionTitle(num: number | undefined, base: string, lang: string): string {
  if (num == null) return base;
  return voiceLookup(`mission.${num}`, lang) ?? base;
}

/** Звание английского раздела (backend ENGLISH_RANKS) в мире скина (`en_rank.<базовое>`). */
/** Базовая лестница званий «Английского» (= backend/app/api_english.py ENGLISH_RANKS). */
export const EN_RANKS = ["Кадет EN", "Слушатель", "Голос экипажа", "Переводчик", "Лингвист флота"];

export function enRank(rank: string | undefined | null, lang: string): string {
  if (!rank) return "";
  const v = voiceLookup(`en_rank.${rank}`, lang);
  if (v !== undefined) return v;
  // без скина — перевод базовой лестницы на язык интерфейса (backend отдаёт русское имя)
  const i = EN_RANKS.indexOf(rank);
  if (i < 0) return rank;
  const key = `en_rank_${i}`;
  return i18n.exists(key, { ns: "ui", lng: lang }) ? i18n.t(key, { ns: "ui", lng: lang }) : rank;
}
