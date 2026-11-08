import { describe, expect, it } from "vitest";
import { DEFERRED_ZONES, ZONE_ORDER, zoneFromDigit } from "./zones";
import { EN_PAGES } from "./routes";

describe("S1 zone contract", () => {
  it("шапка — 7 существующих зон, без Docs/Comm", () => {
    expect(ZONE_ORDER).toEqual([
      "bridge",
      "english",
      "speed",
      "lounge",
      "radio",
      "orion",
      "settings",
    ]);
    expect(ZONE_ORDER).toHaveLength(7);
    for (const z of DEFERRED_ZONES) {
      expect(ZONE_ORDER).not.toContain(z);
    }
  });

  it("Ctrl+1…7 → зона, 8–9 и мусор игнорируются", () => {
    expect(zoneFromDigit("1")).toBe("bridge");
    expect(zoneFromDigit("7")).toBe("settings");
    expect(zoneFromDigit("8")).toBeUndefined();
    expect(zoneFromDigit("9")).toBeUndefined();
    expect(zoneFromDigit("0")).toBeUndefined();
    expect(zoneFromDigit("a")).toBeUndefined();
  });

  it("EN_PAGES совпадает с активными подстраницами English", () => {
    expect([...EN_PAGES]).toEqual([
      "overview",
      "sets",
      "scanner",
      "practice",
      "review",
      "warehouse",
      "book",
      "lists",
      "log",
      "settings",
    ]);
  });
});
