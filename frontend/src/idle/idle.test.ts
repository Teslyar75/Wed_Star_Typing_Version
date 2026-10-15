import { describe, expect, it } from "vitest";
import { fadeVolume, isIdle, pickStation } from "./idleLogic";
import { IDLE_DICTS } from "./idleI18n";

describe("idle logic", () => {
  it("idle after N minutes, off when 0", () => {
    expect(isIdle(0, 3 * 60_000, 3)).toBe(true);
    expect(isIdle(0, 3 * 60_000 - 1, 3)).toBe(false);
    expect(isIdle(0, 99 * 60_000, 0)).toBe(false);
  });
  it("radio fades in to target", () => {
    expect(fadeVolume(0, 6000, 0.3)).toBe(0);
    expect(fadeVolume(3000, 6000, 0.3)).toBeCloseTo(0.15);
    expect(fadeVolume(9000, 6000, 0.3)).toBe(0.3);
  });
  it("pinned station first", () => {
    const l = [{ name: "Random", url_resolved: "a" }, { name: "BBC Radio 3", url_resolved: "b" }];
    expect(pickStation(l, ["BBC Radio 3"])?.url_resolved).toBe("b");
    expect(pickStation(l, ["Nope"])?.url_resolved).toBe("a");
    expect(pickStation([], [])).toBeNull();
  });
  it("i18n keys complete in 4 languages", () => {
    const keys = Object.keys(IDLE_DICTS.ru!);
    for (const l of ["uk", "en", "de"]) for (const k of keys) expect(IDLE_DICTS[l]![k], `${l}.${k}`).toBeTruthy();
  });
});
