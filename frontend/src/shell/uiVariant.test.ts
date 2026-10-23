import { describe, expect, it } from "vitest";
import { readVariant } from "./uiVariant";
import { screensForTab, titleKeyForTab } from "./compartments";

describe("ui variant", () => {
  it("defaults to classic", () => {
    expect(readVariant(null)).toBe("classic");
    expect(readVariant("junk")).toBe("classic");
    expect(readVariant("alt")).toBe("alt");
  });
});

describe("compartment screens (ОБЗОР ▾)", () => {
  it("bridge zone lists all bridge screens", () => {
    expect(screensForTab("cargo").map((s) => s.tab)).toEqual([
      "bridge",
      "missions",
      "cargo",
      "log",
      "bridgeSettings",
    ]);
  });
  it("every zone has at least one screen", () => {
    for (const t of ["english", "speed", "lounge", "radio", "settings"] as const) {
      expect(screensForTab(t).length).toBeGreaterThanOrEqual(1);
    }
  });
  it("title is the current screen", () => {
    expect(titleKeyForTab("log")).toBe("flight_log");
    expect(titleKeyForTab("radio")).toBe("radio");
  });
});
