import { describe, expect, it } from "vitest";
import { ENTRY_DICTS, ENTRY_KEYS } from "./entryI18n";
import { ENTRY_HELP } from "./entryHelp";

describe("ВХОД В КАБИНУ — i18n", () => {
  it("все строки есть на ru/uk/en/de", () => {
    for (const lang of ["ru", "uk", "en", "de"]) {
      const d = ENTRY_DICTS[lang]!;
      const missing = ENTRY_KEYS.filter((k) => !d[k]);
      expect(missing, lang).toEqual([]);
    }
  });
  it("en/de/uk не остались русскими там, где перевод обязателен", () => {
    for (const k of ["title", "takeoff", "new_pilot", "import", "keys_roster"]) {
      expect(ENTRY_DICTS.en![k]).not.toEqual(ENTRY_DICTS.ru![k]);
      expect(ENTRY_DICTS.de![k]).not.toEqual(ENTRY_DICTS.ru![k]);
      expect(ENTRY_DICTS.uk![k]).not.toEqual(ENTRY_DICTS.ru![k]);
    }
  });
  it("F1: справка по каждому режиму на 4 языках", () => {
    for (const lang of ["ru", "uk", "en", "de"]) {
      for (const v of ["roster", "first", "wizard", "import", "honor", "keys"] as const) {
        expect(ENTRY_HELP[lang]![v].length, `${lang}/${v}`).toBeGreaterThan(0);
      }
    }
  });
});
