import { describe, expect, it } from "vitest";
import { scoreSentence, scoreWord, similarity, tokens, verdict, wordForms as wf2 } from "./textutil";

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


describe("scoreWord / verdict (порт десктопа)", () => {
  it("словоформы и неправильные формы → 100", () => {
    expect(scoreWord("run", ["he ran fast"])).toBe(100);
    expect(scoreWord("stop", ["stopped"])).toBe(100);
    expect(wf2("go").has("went")).toBe(true);
  });
  it("sounds_like → 100, иначе сходство", () => {
    expect(scoreWord("cat", ["kat"], ["kat"])).toBe(100);
    expect(scoreWord("house", ["mouse"])).toBe(80);
    expect(scoreWord("house", [])).toBe(0);
  });
  it("пороги вердикта 85/60", () => {
    expect(verdict(85).text).toBe("ОТЛИЧНО");
    expect(verdict(84).text).toBe("ХОРОШО");
    expect(verdict(60).tone).toBe("amber");
    expect(verdict(59).text).toBe("ЕЩЁ РАЗ");
  });
});
