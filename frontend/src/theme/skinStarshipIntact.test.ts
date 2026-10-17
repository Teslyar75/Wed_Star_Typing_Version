import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initI18n, i18n, switchAppLang } from "../i18n/setup";
import { t } from "../i18n";
import oldEngland from "../../../packages/themes/old_england.json";
import spaceship from "../../../packages/themes/spaceship.json";
import type { SkinTheme } from "./applyTheme";
import { EN_RANKS, clearSkinVoice, enRank, setSkinVoice, skinRank, voiceLookup } from "./voice";

const OE = oldEngland as unknown as SkinTheme;
const SS = spaceship as unknown as SkinTheme;
const LANGS = ["ru", "uk", "en", "de"] as const;

/** Базовые строки Звездолёта, которые OE3 перекрывает только в voice pack. */
const STARSHIP_PINNED: Record<string, string> = {
  en_pilot_telemetry: "ТЕЛЕМЕТРИЯ ПИЛОТА",
  en_word_of_day: "Перехвачен сигнал · слово дня",
  en_scanner: "Сканер",
  en_star_maps: "Звёздные карты",
  en_lists_title: "ГРУЗОВЫЕ ОТСЕКИ",
  en_flight_plan: "ПОЛЁТНЫЙ ПЛАН",
  en_mission_done: "МИССИЯ ВЫПОЛНЕНА",
  flight_done: "Полёт завершён",
  bridge: "Мостик",
  set_living: "Живой космос",
};

const placeholders = (s: string) => (s.match(/\{\d\}/g) || []).sort().join(",");

beforeAll(async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  await initI18n("ru");
});
afterEach(() => clearSkinVoice());

describe("Starship stays untouched (OE3)", () => {
  it("spaceship skin has no voice pack", () => {
    expect(SS.voice).toBeUndefined();
  });

  it("Starship base strings are pinned and unchanged", async () => {
    await switchAppLang("ru");
    setSkinVoice(SS.voice, SS.ranks_i18n);
    for (const [k, v] of Object.entries(STARSHIP_PINNED)) expect(t(k)).toBe(v);
  });

  it("with Starship every OE-overridden key resolves to the base string in all langs", async () => {
    for (const l of LANGS) {
      await switchAppLang(l);
      setSkinVoice(SS.voice, SS.ranks_i18n);
      for (const k of Object.keys(OE.voice![l])) {
        if (k.includes(".")) continue; // entry./mission./help./en_rank. — не ui-ключи
        if (!i18n.exists(k, { ns: "ui" })) continue;
        expect(t(k)).toBe(i18n.t(k, { ns: "ui" }));
      }
      expect(skinRank("Кадет", l)).toBe("Кадет");
      expect(enRank("Кадет EN", l)).toBe({ ru: "Кадет EN", uk: "Кадет EN", en: "Cadet EN", de: "Kadett EN" }[l]);
      expect(enRank("Лингвист флота", l)).toBe(
        { ru: "Лингвист флота", uk: "Лінгвіст флоту", en: "Fleet linguist", de: "Flottenlinguist" }[l],
      );
      expect(enRank("неизвестно", l)).toBe("неизвестно");
      expect(voiceLookup("uplink_tag", l)).toBeUndefined(); // мостик Звездолёта: «UPLINK //»
    }
  });
});

describe("Old England English section (OE3)", () => {
  it("overrides cover ru/uk/en/de with the same keys and placeholders", () => {
    const ru = Object.keys(OE.voice!.ru).sort();
    for (const l of LANGS) {
      expect(Object.keys(OE.voice![l]).sort()).toEqual(ru);
      for (const k of ru) {
        const base = i18n.getResource(l, "ui", k) as string | undefined;
        if (base) expect(placeholders(OE.voice![l][k]), `${l}.${k}`).toBe(placeholders(base));
      }
    }
  });

  it("no space wording left in Old England english labels", async () => {
    await switchAppLang("ru");
    setSkinVoice(OE.voice, OE.ranks_i18n);
    expect(t("en_pilot_telemetry")).toBe("ТЕТРАДЬ УЧЕНИКА");
    expect(t("en_word_of_day")).toBe("Из утренней газеты · слово дня");
    expect(enRank("Кадет EN", "ru")).toBe("Ученик");
    expect(enRank("Лингвист флота", "en")).toBe("Baker Street linguist");
    const spacey = /косм|звёзд|звезд|телеметр|сигнал|сканер|миссия|миссии|полёт|борт|отсек|склад|гипердрайв|иллюмин|прицел|стыков|маршрут|сектор|провер\w* систем|канал связи|голосвяз|расшифр|UPLINK/i;
    const en = Object.keys(i18n.getResourceBundle("ru", "ui")).filter((k) => k.startsWith("en_"));
    const left = en.filter((k) => spacey.test(t(k)));
    expect(left).toEqual([]);
  });

  it("English section in uk/en/de has no space wording under Old England", async () => {
    const re: Record<string, RegExp> = {
      uk: /косм|зорян|телеметр|сигнал(?!у мікро)|сканер|місі|політ|борт|відсік|склад(і|у|ом)?(?![а-яіїєґ.])|гіпердрайв|ілюмінатор|приціл|стикуван|маршрут|сектор|UPLINK/i,
      en: /cosmos|galax|planet|orbit|star map|telemetry|signal|scanner|\bmission|flight|aboard|warehouse|hyperdrive|viewport|crosshair|docking|route|sector|systems check|comms|decrypt|transmit|UPLINK/i,
      de: /weltraum|kosm|stern|telemetrie|signal|scanner|\bmission|flug|bord|frachtraum|lager|hyperantrieb|bullauge|fadenkreuz|andock|route|sektor|systemcheck|UPLINK/i,
    };
    for (const l of ["uk", "en", "de"] as const) {
      await switchAppLang(l);
      setSkinVoice(OE.voice, OE.ranks_i18n);
      const keys = Object.keys(i18n.getResourceBundle("en", "ui")).filter((k) => k.startsWith("en_"));
      const left = keys.filter((k) => re[l].test(t(k))).map((k) => `${k}=${t(k)}`);
      expect(left, l).toEqual([]);
    }
  });
});

describe("English ranks from backend", () => {
  it("EN_RANKS mirror backend ENGLISH_RANKS (order and names)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "../backend/app/api_english.py"), "utf-8");
    const block = src.slice(src.indexOf("ENGLISH_RANKS = ["), src.indexOf("]", src.indexOf("ENGLISH_RANKS = [")));
    const names = [...block.matchAll(/\(\d+, "([^"]+)"\)/g)].map((m) => m[1]);
    expect(names).toEqual(EN_RANKS);
  });
});
