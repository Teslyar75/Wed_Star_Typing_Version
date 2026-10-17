import { describe, expect, it } from "vitest";
import { adaptForTyping, buildUplinkSegments, uplinkSourceAt, CHUNK_WORDS } from "./uplinkSegments";

describe("uplinkSegments", () => {
  it("chunks adapted text by ~14 words when no original", () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`);
    const adapted = words.join(" ");
    const segs = buildUplinkSegments(adapted);
    expect(segs.length).toBe(Math.ceil(30 / CHUNK_WORDS));
    expect(uplinkSourceAt(segs, 0).split(" ").length).toBe(CHUNK_WORDS);
  });

  it("uses original sentences when adapt matches", () => {
    const original = "Hello world. Next sentence here.";
    const adapted = adaptForTyping(original);
    const segs = buildUplinkSegments(adapted, original);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    expect(uplinkSourceAt(segs, 0)).toMatch(/Hello world/i);
    const mid = segs[1]!.start;
    expect(uplinkSourceAt(segs, mid)).toMatch(/Next sentence/i);
  });

  it("one source line is short", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    const segs = buildUplinkSegments(words.join(" "));
    for (const s of segs) {
      expect(s.source.split(/\s+/).length).toBeLessThanOrEqual(CHUNK_WORDS);
    }
  });
});
