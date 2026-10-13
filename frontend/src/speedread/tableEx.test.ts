import { describe, expect, it } from "vitest";
import { fmtS, gorbovNorm, schulteNorm, starsFor } from "./tableEx";

describe("tableEx norms", () => {
  it("schulte 5x5 base thresholds", () => {
    expect(schulteNorm(5)).toEqual([35, 50, 70]);
  });

  it("gorbov multiplies by 1.7", () => {
    const [a, b, c] = gorbovNorm(5);
    expect(a).toBeCloseTo(35 * 1.7);
    expect(b).toBeCloseTo(50 * 1.7);
    expect(c).toBeCloseTo(70 * 1.7);
  });

  it("starsFor lower is better", () => {
    const n: [number, number, number] = [60, 85, 119];
    expect(starsFor(50, n)).toBe(3);
    expect(starsFor(70, n)).toBe(2);
    expect(starsFor(100, n)).toBe(1);
    expect(starsFor(200, n)).toBe(0);
  });

  it("fmtS matches desktop MM:SS.s", () => {
    expect(fmtS(0)).toBe("00:00.0");
    expect(fmtS(23.4)).toBe("00:23.4");
    expect(fmtS(65.1)).toBe("01:05.1");
  });
});
