import { describe, expect, it } from "vitest";
import { buildPyramid, buildPyramidRows, pyrFieldWidth, PYR_NORM, PYR_ROWS } from "./epyr";
import { starsFor } from "./tableEx";

describe("buildPyramidRows (desktop PyramidEx)", () => {
  it("builds 14 rows with widths 2+i*3 and field 6…45", () => {
    const rows = buildPyramidRows("en");
    expect(rows).toHaveLength(PYR_ROWS);
    expect(rows[0]!.width).toBe(2);
    expect(pyrFieldWidth(rows[0]!)).toBe(6);
    expect(pyrFieldWidth(rows[13]!)).toBe(45);
    expect(rows[0]!.a).toHaveLength(2);
    expect(rows[0]!.b).toHaveLength(2);
  });

  it("stars grow with field width", () => {
    expect(starsFor(34, PYR_NORM, false)).toBe(3);
    expect(starsFor(24, PYR_NORM, false)).toBe(2);
    expect(starsFor(14, PYR_NORM, false)).toBe(1);
    expect(starsFor(10, PYR_NORM, false)).toBe(0);
  });
});

describe("buildPyramid (legacy)", () => {
  it("grows line width", () => {
    const lines = buildPyramid("abcdefghijklmnop qrstuvwxyz", 4);
    expect(lines).toHaveLength(4);
    expect(lines[0]!.length).toBeLessThanOrEqual(lines[3]!.length);
  });
});
