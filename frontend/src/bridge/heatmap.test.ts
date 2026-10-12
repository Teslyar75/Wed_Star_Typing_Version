import { describe, expect, it } from "vitest";

function colorFor(rate: number | undefined): string {
  if (rate == null || rate <= 0) return "transparent";
  if (rate < 0.05) return "green";
  if (rate < 0.12) return "amber";
  return "red";
}

describe("heatmap color bands", () => {
  it("maps rates", () => {
    expect(colorFor(0)).toBe("transparent");
    expect(colorFor(0.02)).toBe("green");
    expect(colorFor(0.08)).toBe("amber");
    expect(colorFor(0.2)).toBe("red");
  });
});
