import { describe, expect, it } from "vitest";
import { applyFormat, DocUndoStack, findNext, htmlToMd, replaceAll, wrapSelection } from "./docsFormat";
import { filterItems, pageOf, sortItems, wordCount } from "./docsApi";
import { mdToHtml, mdToPlain } from "./docsMd";

describe("docsFormat", () => {
  it("wraps bold and toggles heading", () => {
    const w = wrapSelection("ab", { start: 0, end: 2 }, "**", "**");
    expect(w.body).toBe("**ab**");
    const h = applyFormat("h1", "title", { start: 0, end: 0 });
    expect(h.body.startsWith("# ")).toBe(true);
    const h2 = applyFormat("h1", h.body, { start: 0, end: 0 });
    expect(h2.body.startsWith("# ")).toBe(false);
  });

  it("find/replace and html paste", () => {
    expect(findNext("Aa Bb aa", "aa", 0)).toBe(0);
    expect(replaceAll("Aa Bb aa", "aa", "X").body).toBe("X Bb X");
    expect(htmlToMd("<p>Hi <b>there</b></p>")).toMatch(/Hi/);
    expect(htmlToMd("<p>Hi <b>there</b></p>")).toMatch(/\*\*there\*\*/);
  });

  it("undo stack", () => {
    const s = new DocUndoStack();
    s.reset();
    s.pushBefore({ title: "a", body: "1" }, { title: "a", body: "2" });
    const u = s.doUndo({ title: "a", body: "2" });
    expect(u?.body).toBe("1");
    const r = s.doRedo({ title: "a", body: "1" });
    expect(r?.body).toBe("2");
  });
});

describe("docsMd + list helpers", () => {
  it("renders markdown and filters", () => {
    const html = mdToHtml("T", "**x**\n\n- a");
    expect(html).toMatch(/<strong>x<\/strong>/);
    expect(html).toMatch(/<ul>/);
    expect(mdToPlain("**hi**")).toBe("hi");
    const items = [
      { id: 1, title: "Alpha", rev: 1, words: 1, updated_at: "2020", snippet: "cat" },
      { id: 2, title: "Beta", rev: 1, words: 1, updated_at: "2021", snippet: "dog" },
    ];
    expect(filterItems(items, "cat")).toHaveLength(1);
    expect(sortItems(items, "title")[0].title).toBe("Alpha");
    expect(pageOf(items, 0, 1).rows).toHaveLength(1);
    expect(wordCount("a b")).toBe(2);
  });
});
