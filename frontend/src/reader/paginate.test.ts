import { describe, expect, it } from "vitest";
import { pageIndexForSentence, paginate } from "./paginate";

describe("paginate", () => {
  it("splits by char budget", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      sentence_id: i,
      original: "word ".repeat(30),
    }));
    const pages = paginate(rows, 200);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]!.fromId).toBe(0);
  });

  it("finds page by sentence_id", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      sentence_id: i,
      original: "abcdefghij",
    }));
    const pages = paginate(rows, 25);
    const idx = pageIndexForSentence(pages, pages[1]?.fromId ?? 0);
    expect(idx).toBeGreaterThanOrEqual(0);
  });
});
