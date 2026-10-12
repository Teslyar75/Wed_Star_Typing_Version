import { describe, expect, it } from "vitest";
import { wordAt, wordCursor } from "./uplink";

describe("uplink word helpers", () => {
  const text = "orbital station began";

  it("wordAt finds token under index", () => {
    const i = text.indexOf("station") + 1; // 't' in station
    expect(wordAt(text, i)).toBe("station");
  });

  it("wordCursor is offset inside word", () => {
    const i = text.indexOf("station") + 2; // 'a'
    expect(wordAt(text, i)).toBe("station");
    expect(wordCursor(text, i)).toBe(2);
  });

  it("space yields next word", () => {
    const i = text.indexOf(" ");
    expect(wordAt(text, i)).toBe("station");
    expect(wordCursor(text, i)).toBe(-1);
  });
});
