import { describe, expect, it } from "vitest";
import { colorFor, heatColor, heatFillMix } from "./heatmapColor";

describe("heatmap color bands", () => {
  it("returns null without rate", () => {
    expect(colorFor(undefined)).toBeNull();
  });

  it("greens low error rates", () => {
    const low = colorFor(0.1)!;
    expect(low.startsWith("#")).toBe(true);
    expect(low.toLowerCase()).not.toBe("#ff3b5c");
  });

  it("ambers around 50%", () => {
    expect(colorFor(0.5)!.toLowerCase()).toBe("#ffb000");
  });

  it("reds high rates toward 100%", () => {
    expect(colorFor(1)!.toLowerCase()).toBe("#ff3b5c");
    const midHigh = colorFor(0.75)!.toLowerCase();
    expect(midHigh).not.toBe("#ffb000");
    expect(midHigh).not.toBe(colorFor(0.33)!.toLowerCase());
  });

  it("differentiates mid rates visible on flog", () => {
    expect(colorFor(0.333)!.toLowerCase()).not.toBe(colorFor(0.667)!.toLowerCase());
  });

  it("heatColor blends endpoints", () => {
    expect(heatColor(0).toLowerCase()).not.toBe("#ff3b5c");
    expect(heatColor(0.5).toLowerCase()).toBe("#ffb000");
    expect(heatColor(1).toLowerCase()).toBe("#ff3b5c");
  });

  it("denser fill for higher raw rates", () => {
    expect(heatFillMix(0.1)).toBeLessThan(heatFillMix(0.6));
    expect(heatFillMix(1)).toBe(80);
  });
});
