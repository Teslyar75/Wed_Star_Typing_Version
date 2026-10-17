import { describe, expect, it } from "vitest";
import { dedupeStations, fadeVolume, isIdle, orderStations, pickStation, stationGenre } from "./idleLogic";
import { IDLE_DICTS } from "./idleI18n";
import { IDLE_MINUTES } from "./idleStore";

describe("idle logic", () => {
  it("idle after N minutes, off when 0", () => {
    expect(isIdle(0, 3 * 60_000, 3)).toBe(true);
    expect(isIdle(0, 3 * 60_000 - 1, 3)).toBe(false);
    expect(isIdle(0, 99 * 60_000, 0)).toBe(false);
  });
  it("minutes modes match desktop", () => {
    expect(IDLE_MINUTES).toEqual([0, 1, 3, 5]);
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
  it("orderStations: saved then pinned", () => {
    const l = [
      { name: "Zulu", url_resolved: "z" },
      { name: "BBC Radio 3", url_resolved: "b" },
      { name: "Groove Salad", url_resolved: "g" },
    ];
    expect(orderStations(l, "Groove Salad", ["BBC Radio 3"]).map((s) => s.url_resolved)).toEqual(["g", "b", "z"]);
  });
  it("dedupe and genre", () => {
    expect(dedupeStations([
      { name: "A", url_resolved: "u", stationuuid: "1" },
      { name: "A2", url_resolved: "u", stationuuid: "1" },
    ])).toHaveLength(1);
    expect(stationGenre({ tags: "jazz · swing · more" })).toBe("jazz, swing");
  });
  it("i18n keys complete in 4 languages", () => {
    const keys = Object.keys(IDLE_DICTS.ru!);
    for (const l of ["uk", "en", "de"]) for (const k of keys) expect(IDLE_DICTS[l]![k], `${l}.${k}`).toBeTruthy();
  });
});
