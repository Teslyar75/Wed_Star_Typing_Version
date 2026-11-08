import { describe, expect, it } from "vitest";
import { ZEN_LANGS, zenKeys } from "./zenI18n";

describe("zen i18n", () => {
  it("ru/uk/en/de have the same keys", () => {
    expect(ZEN_LANGS.sort()).toEqual(["de", "en", "ru", "uk"]);
    for (const l of ZEN_LANGS) expect(zenKeys(l).sort()).toEqual(zenKeys("ru").sort());
  });
});
