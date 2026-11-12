import { describe, expect, it } from "vitest";
import { DEFERRED_ZONES, FIXED_HOTKEYS, ZONE_ORDER, zoneFromDigit } from "./zones";
import { EN_PAGES } from "./routes";

describe("S1 zone contract", () => {
  it("шапка — зоны с lab перед settings; Эфир после радио", () => {
    expect(ZONE_ORDER).toEqual([
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
    ]);
    expect(ZONE_ORDER).toHaveLength(10);
    expect(ZONE_ORDER.indexOf("comm")).toBeGreaterThan(ZONE_ORDER.indexOf("radio"));
    expect(ZONE_ORDER.indexOf("docs")).toBeLessThan(ZONE_ORDER.indexOf("orion"));
    expect(ZONE_ORDER.indexOf("lab")).toBe(ZONE_ORDER.indexOf("settings") - 1);
    for (const z of DEFERRED_ZONES) {
      expect(ZONE_ORDER).not.toContain(z);
    }
  });

  it("Ctrl+1…9 без lab; Ctrl+0 = lab; settings остаётся Ctrl+9", () => {
    expect(FIXED_HOTKEYS.lab).toBe("0");
    expect(zoneFromDigit("1")).toBe("bridge");
    expect(zoneFromDigit("6")).toBe("comm");
    expect(zoneFromDigit("7")).toBe("docs");
    expect(zoneFromDigit("8")).toBe("orion");
    expect(zoneFromDigit("9")).toBe("settings");
    expect(zoneFromDigit("0")).toBe("lab");
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
