import { describe, expect, it } from "vitest";
import { kogasa, PortalTest, prepareWords, quoteLen } from "./zenEngine";

describe("zen engine (Monkeytype rules)", () => {
  it("prepares words with end offsets", () => {
    const w = prepareWords("Hello, World! 42 ok", 0);
    expect(w.map((x) => x.word)).toEqual(["hello", "world", "ok"]);
    expect(w[0]!.end).toBe(7);
    expect(prepareWords("Привет, мир", 0)[0]!.word).toBe("привет");
  });
  it("wpm counts correct words + spaces, timer from first key", () => {
    const t = new PortalTest(["ab", "cd"], "words", 2);
    t.typeChar("a", 0); t.typeChar("b", 1); t.typeChar(" ", 2); t.typeChar("c", 3); t.typeChar("d", 6);
    expect(t.finished).toBe(true);
    expect(t.elapsed()).toBe(6);
    expect(t.wpm()).toBeCloseTo(5 / 5 / 0.1);
    expect(t.acc()).toBe(100);
  });
  it("extra letters, backspace only into wrong word", () => {
    const t = new PortalTest(["ab", "cd", "ef"]);
    t.typeChar("a", 0); t.typeChar("b", 0.1); t.typeChar(" ", 0.2);
    t.backspace();
    expect(t.wi).toBe(1);
    t.typeChar("x", 0.3); t.typeChar(" ", 0.4);
    t.backspace(); expect(t.wi).toBe(1);
    t.typeChar("y", 0.5); t.typeChar("z", 0.5); t.typeChar("q", 0.6);
    expect(t.chars().extra).toBe(2); // "xyzq" vs "cd"
    t.backspace(true); expect(t.inputs[1]).toBe("");
  });
  it("time mode ends at limit", () => {
    const t = new PortalTest(["a", "b", "c"], "time", 15);
    t.typeChar("a", 0); t.tick(16);
    expect(t.finished).toBe(true); expect(t.elapsed()).toBe(15);
    expect(t.samples.length).toBe(15);
  });
  it("last correct word for bridge advance", () => {
    const t = new PortalTest(["ab", "cd", "ef"]);
    t.typeChar("a", 0); t.typeChar("b", 0); t.typeChar(" ", 0); t.typeChar("x", 0); t.typeChar(" ", 0);
    expect(t.lastCorrectWord()).toBe(0);
  });
  it("kogasa / quote", () => {
    expect(kogasa(0)).toBe(100);
    expect(quoteLen("a b c. d", 0, 2)).toBe(3);
  });
});
