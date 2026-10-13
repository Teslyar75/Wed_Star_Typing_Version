import { describe, expect, it } from "vitest";
import { countWords, etaMinutes, paginateBookText } from "./bookPaginate";

describe("bookPaginate", () => {
  it("scroll keeps one page", () => {
    const t = "Hello world.\n\nSecond para.";
    expect(paginateBookText(t, "scroll")).toEqual([t.replace(/\r\n/g, "\n").trim()]);
  });

  it("splits long text into several pages", () => {
    const para = "word ".repeat(400).trim();
    const pages = paginateBookText(`${para}\n\n${para}\n\n${para}`, "spread");
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join(" ").length).toBeGreaterThan(1000);
  });

  it("eta and word count", () => {
    expect(countWords("one two three")).toBe(3);
    expect(etaMinutes(460)).toBe(2);
  });
});
