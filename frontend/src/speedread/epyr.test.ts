import { describe, expect, it } from "vitest";
import { buildPyramid } from "./epyr";

describe("buildPyramid", () => {
  it("grows line width", () => {
    const lines = buildPyramid("abcdefghijklmnop qrstuvwxyz", 4);
    expect(lines).toHaveLength(4);
    expect(lines[0]!.length).toBeLessThanOrEqual(lines[3]!.length);
  });
});
