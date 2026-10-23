import { describe, expect, it } from "vitest";
import { colorFor, maskKey, pageOf } from "./orionApi";
import { ORION_DICTS } from "./orionI18n";

describe("orion helpers", () => {
  it("colorFor matches desktop stops and blends", () => {
    expect(colorFor(0)).toBe("#d96a5f");
    expect(colorFor(50)).toBe("#e6c45c");
    expect(colorFor(100)).toBe("#6fbf73");
    expect(colorFor(10)).toBe("#dd7a5b");
  });
  it("maskKey never shows the full key", () => {
    expect(maskKey("sk-abcdefghijklmnop")).toBe("sk-…mnop");
    expect(maskKey("short")).toBe("••••");
  });
  it("pageOf clamps", () => {
    expect(pageOf([1, 2, 3, 4, 5], 9, 2)).toEqual({ rows: [5], pages: 3, page: 2 });
  });
  it("all locales have the same keys", () => {
    const ru = Object.keys(ORION_DICTS.ru).sort();
    for (const l of ["en", "uk", "de"]) expect(Object.keys(ORION_DICTS[l]).sort()).toEqual(ru);
  });
});
