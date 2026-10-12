import { describe, expect, it } from "vitest";
import { gorbovSequence, shuffleGorbovGrid } from "./gorbov";

describe("gorbov", () => {
  it("alternates black then red for 5x5", () => {
    const seq = gorbovSequence(5);
    expect(seq.length).toBe(25);
    expect(seq[0]).toEqual({ color: "b", value: 1 });
    expect(seq[1]?.color).toBe("r");
  });

  it("shuffles grid of correct size", () => {
    expect(shuffleGorbovGrid(5)).toHaveLength(25);
  });
});
