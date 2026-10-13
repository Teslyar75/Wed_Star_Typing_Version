import { describe, expect, it } from "vitest";
import {
  clampTacMs,
  clampTacWords,
  flashPool,
  flashScore,
  flashStars,
  flattenTyped,
  formatFlashLines,
  formatInputWrap,
  isBetterFlash,
  ladderAfter,
  pickFlashAnswer,
  roundPoints,
  tacFrameGeom,
  TAC_MAX_MS,
  TAC_MAX_WORDS,
  TAC_START_MS,
} from "./flashEx";

describe("flashEx (desktop FlashEx)", () => {
  it("uses book words when available", () => {
    const pool = flashPool("hello world hello radar space", "en");
    expect(pool).toContain("hello");
    expect(pool).toContain("world");
  });

  it("falls back to language pack", () => {
    const pool = flashPool("", "ru");
    expect(pool.length).toBeGreaterThan(5);
    expect(pool).toContain("дом");
  });

  it("ladder: 3 correct shorten ms", () => {
    let ms = TAC_START_MS;
    let nw = 1;
    let streak = 0;
    for (let i = 0; i < 3; i++) {
      const n = ladderAfter(true, ms, nw, streak);
      ms = n.ms;
      nw = n.nwords;
      streak = n.streak;
    }
    expect(ms).toBe(280);
    expect(streak).toBe(0);
  });

  it("ladder: error widens ms", () => {
    const n = ladderAfter(false, 200, 1, 2);
    expect(n.ms).toBe(220);
    expect(n.streak).toBe(0);
  });

  it("stars and difficulty points", () => {
    expect(flashStars(3, 100)).toBe(3);
    expect(TAC_MAX_MS).toBe(1000);
    /* 4 буквы × 2 слова × (1000/100)=10 → 80 */
    expect(roundPoints("test word", 2, 100)).toBe(8 * 2 * 10);
    expect(roundPoints("ab", 1, 50)).toBeGreaterThan(roundPoints("ab", 1, 500));
    expect(roundPoints("abcd", 5, 100)).toBeGreaterThan(roundPoints("abcd", 1, 100));
    expect(flashScore(2, 120, 500)).toBe(500);
    expect(flashStars(1, 300, 1500, 12)).toBe(3);
  });

  it("isBetterFlash prefers more words then lower ms", () => {
    expect(isBetterFlash(2, 200, 1, 100)).toBe(true);
    expect(isBetterFlash(1, 80, 1, 100)).toBe(true);
    expect(isBetterFlash(1, 120, 1, 100)).toBe(false);
  });

  it("pickFlashAnswer joins n words", () => {
    const a = pickFlashAnswer(["aa", "bb", "cc"], 2);
    expect(a.split(" ")).toHaveLength(2);
  });

  it("frame grows width to 3 cols then height by rows", () => {
    expect(tacFrameGeom(1).cols).toBe(1);
    expect(tacFrameGeom(3).cols).toBe(3);
    expect(tacFrameGeom(3).rows).toBe(1);
    expect(tacFrameGeom(4).rows).toBe(2);
    expect(tacFrameGeom(10).rows).toBe(4);
    expect(tacFrameGeom(3).widthCh).toBe(tacFrameGeom(10).widthCh);
    expect(tacFrameGeom(10).minHeightEm).toBeGreaterThan(tacFrameGeom(3).minHeightEm);
    expect(clampTacWords(12)).toBe(TAC_MAX_WORDS);
    expect(clampTacMs(40)).toBe(50);
  });

  it("wraps flash and input by 3 words per line", () => {
    expect(formatFlashLines("a b c d e", false)).toBe("a b c\nd e");
    expect(formatInputWrap("one two three four")).toBe("one two three\nfour");
    expect(flattenTyped("one two three\nfour")).toBe("one two three four");
  });
});
