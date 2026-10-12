import { describe, expect, it } from "vitest";
import { makeQuiz } from "./quiz";

describe("makeQuiz", () => {
  it("returns empty for short text", () => {
    expect(makeQuiz("hi there")).toEqual([]);
  });

  it("builds yes/no items", () => {
    const text =
      "captain mountain garden planet violin blanket harbour silver engine pocket theatre carpet lantern";
    const items = makeQuiz(text, "en");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((i) => i.options.length === 2)).toBe(true);
  });
});
