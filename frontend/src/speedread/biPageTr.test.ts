import { describe, expect, it } from "vitest";
import { fixedBilingualRight, parasFromSegments, splitParas } from "./biPageTr";

describe("fixedBilingualRight", () => {
  it("берёт столько же абзацев перевода, сколько на левой странице", () => {
    const orig = ["I", "One morning Gregor woke.", "He looked at the clock."];
    const tr = ["I", "Однажды утром Грегор проснулся.", "Он посмотрел на часы."];
    const left = "I\n\nOne morning Gregor woke.";
    expect(fixedBilingualRight(left, orig, tr)).toBe("I\n\nОднажды утром Грегор проснулся.");
  });

  it("не отдаёт всю книгу справа", () => {
    const orig = splitParas("A\n\nB\n\nC\n\nD");
    const tr = splitParas("а\n\nб\n\nв\n\nг");
    const right = fixedBilingualRight("A\n\nB", orig, tr);
    expect(right.split(/\n{2,}/).length).toBe(2);
    expect(right).not.toContain("г");
  });
});

describe("parasFromSegments", () => {
  it("собирает абзацы по para_idx", () => {
    const { orig, tr } = parasFromSegments([
      { original: "Hello", translation: "Привет", para_idx: 0 },
      { original: "world", translation: "мир", para_idx: 0 },
      { original: "Next", translation: "Дальше", para_idx: 1 },
    ]);
    expect(orig[0]).toContain("Hello");
    expect(tr[0]).toContain("Привет");
    expect(orig[1]).toBe("Next");
  });
});
