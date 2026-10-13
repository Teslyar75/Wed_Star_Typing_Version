import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storeMem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storeMem.set(k, String(v));
  },
  removeItem: (k: string) => {
    storeMem.delete(k);
  },
  clear: () => storeMem.clear(),
  key: () => null,
  length: 0,
});

import {
  DEFAULT_SPEED_PREFS,
  loadLastWpm,
  loadSpeedPrefs,
  resolveStartWpm,
  saveLastWpm,
  saveSpeedPrefs,
} from "./speedPrefs";

describe("speedPrefs", () => {
  beforeEach(() => {
    storeMem.clear();
  });

  it("loads defaults when empty", () => {
    expect(loadSpeedPrefs()).toEqual(DEFAULT_SPEED_PREFS);
  });

  it("persists ramp and show prefs", () => {
    saveSpeedPrefs({
      ...DEFAULT_SPEED_PREFS,
      start: 350,
      target: 700,
      mode: "steps",
      punctPauses: false,
      wordsPerFrame: 3,
      orp: false,
    });
    const p = loadSpeedPrefs();
    expect(p.start).toBe(350);
    expect(p.target).toBe(700);
    expect(p.mode).toBe("steps");
    expect(p.punctPauses).toBe(false);
    expect(p.wordsPerFrame).toBe(3);
    expect(p.orp).toBe(false);
  });

  it("migrates legacy st_speed_ramp", () => {
    localStorage.setItem(
      "st_speed_ramp",
      JSON.stringify({ start: 280, target: 550, step: 15, everyS: 40, mode: "smooth" }),
    );
    const p = loadSpeedPrefs();
    expect(p.start).toBe(280);
    expect(p.target).toBe(550);
    expect(p.step).toBe(15);
    expect(p.everyS).toBe(40);
  });

  it("resolveStartWpm uses last wpm in [start, target]", () => {
    const prefs = { ...DEFAULT_SPEED_PREFS, start: 300, target: 600 };
    expect(resolveStartWpm(prefs, 7)).toBe(300);
    saveLastWpm(7, 450);
    expect(loadLastWpm(7)).toBe(450);
    expect(resolveStartWpm(prefs, 7)).toBe(450);
    saveLastWpm(7, 900);
    expect(resolveStartWpm(prefs, 7)).toBe(600);
    saveLastWpm(7, 100);
    expect(resolveStartWpm(prefs, 7)).toBe(300);
  });
});
