import { describe, expect, it } from "vitest";
import { DONE, ERROR, IDLE_CAP, OK, TypingEngine } from "./engine";

describe("TypingEngine", () => {
  it("accepts correct chars and finishes", () => {
    const e = new TypingEngine("ab");
    expect(e.press("a", 1)).toBe(OK);
    expect(e.press("b", 1.2)).toBe(DONE);
    expect(e.finished).toBe(true);
  });

  it("counts errors without advancing", () => {
    const e = new TypingEngine("a");
    expect(e.press("x", 1)).toBe(ERROR);
    expect(e.index).toBe(0);
    expect(e.errors).toBe(1);
  });

  it("caps idle gaps", () => {
    const e = new TypingEngine("ab");
    e.press("a", 0);
    e.press("b", IDLE_CAP + 10);
    const seg = e.segment(IDLE_CAP + 10);
    expect(seg.elapsed).toBeLessThanOrEqual(IDLE_CAP + 0.01);
  });

  it("cpm uses correct chars only", () => {
    const e = new TypingEngine("aaa");
    e.press("a", 0);
    e.press("x", 1);
    e.press("a", 2);
    expect(e.index).toBe(2);
    expect(e.cpm(2)).toBeGreaterThan(0);
  });

  it("pause freezes elapsed", () => {
    const e = new TypingEngine("ab");
    e.press("a", 0);
    e.pause(1);
    const a = e.elapsed(1);
    const b = e.elapsed(5);
    expect(a).toBe(b);
  });
});
