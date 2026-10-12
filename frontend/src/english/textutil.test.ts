import { describe, expect, it } from "vitest";
import { scoreSentence, similarity, tokens } from "./textutil";

describe("textutil port", () => {
  it("expands contractions", () => {
    expect(tokens("I'm learning")).toEqual(["i", "am", "learning"]);
  });

  it("similarity exact", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("scores identical sentence 100", () => {
    const { score, marks } = scoreSentence("the cat sat", "the cat sat");
    expect(score).toBe(100);
    expect(marks.every(([, ok]) => ok)).toBe(true);
  });

  it("penalizes missing target word", () => {
    const { score } = scoreSentence("I learn English", "I study English", "learn");
    expect(score).toBeLessThanOrEqual(59);
  });

  it("matches close words", () => {
    const { score } = scoreSentence("hello world", "hello word");
    expect(score).toBeGreaterThanOrEqual(50);
  });
});
