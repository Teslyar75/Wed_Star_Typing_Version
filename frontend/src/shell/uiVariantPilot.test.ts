import { beforeEach, describe, expect, it } from "vitest";
import { storeVariantFor, variantFor, variantKey } from "./uiVariant";

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

describe("variant per pilot", () => {
  it("keys by callsign", () => {
    expect(variantKey("Ace")).toBe("st_ui_variant:ace");
    expect(variantKey(null)).toBe("st_ui_variant");
  });
  it("pilot value wins, falls back to global", () => {
    mem.set("st_ui_variant", "alt");
    expect(variantFor("bob")).toBe("alt");
    storeVariantFor("bob", "classic");
    expect(variantFor("bob")).toBe("classic");
    expect(variantFor("eve")).toBe("alt");
  });
});
