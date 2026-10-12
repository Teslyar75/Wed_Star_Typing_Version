import { describe, expect, it } from "vitest";
import { msPerWord, slotErrorMs, wordsElapsed } from "./timing";

describe("RSVP timing", () => {
  it("msPerWord at 300 WPM is 200ms", () => {
    expect(msPerWord(300)).toBe(200);
  });

  it("wordsElapsed counts whole slots", () => {
    expect(wordsElapsed(300, 199)).toBe(0);
    expect(wordsElapsed(300, 200)).toBe(1);
    expect(wordsElapsed(300, 999)).toBe(4);
  });

  it("slot drift under 5ms for on-time fire", () => {
    const wpm = 400;
    const idx = 10;
    const fired = idx * msPerWord(wpm) + 2.5;
    expect(slotErrorMs(wpm, fired, idx)).toBeLessThan(5);
  });
});
