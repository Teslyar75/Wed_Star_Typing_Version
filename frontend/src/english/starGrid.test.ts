import { describe, expect, it } from "vitest";
import { fitStarGrid, remapPage } from "./starGrid";

describe("fitStarGrid", () => {
  it("clamps columns 2..6 like desktop", () => {
    expect(fitStarGrid(200, 400).cols).toBe(2);
    expect(fitStarGrid(3000, 400).cols).toBe(6);
    expect(fitStarGrid(626, 400).cols).toBe(4);
  });
  it("rows fit height, page = cols*rows", () => {
    const g = fitStarGrid(1000, 300);
    expect(g.rows).toBe(3);
    expect(g.size).toBe(g.cols * g.rows);
    expect(fitStarGrid(1000, 50).rows).toBe(1);
  });
  it("remap keeps first card", () => {
    expect(remapPage(3, 24, 12)).toBe(6);
    expect(remapPage(5, 12, 24)).toBe(2);
    expect(remapPage(2, 8, 8)).toBe(2);
  });
});
