import { describe, expect, it } from "vitest";
import { detectLang, pickBrowserVoice, qualityTag, rankVoices, voiceRank } from "./voices";

const V = (name: string, lang: string, localService = true) => ({ name, lang, localService });
const voices = [
  V("Microsoft David - English (United States)", "en-US"),
  V("Microsoft Zira - English (United States)", "en-US"),
  V("Google UK English Female", "en-GB", false),
  V("Google US English", "en-US", false),
  V("Microsoft Aria Online (Natural) - English (United States)", "en-US", false),
  V("Microsoft Ryan Online (Natural) - English (United Kingdom)", "en-GB", false),
  V("eSpeak English", "en"),
  V("Microsoft Irina - Russian", "ru-RU"),
  V("Google русский", "ru-RU", false),
];

describe("voice ranking", () => {
  it("Microsoft Natural > Google > local SAPI > eSpeak", () => {
    const names = rankVoices(voices, "en-US").map((v) => v.name);
    expect(names[0]).toContain("Aria Online (Natural)");
    expect(names[1]).toContain("Ryan Online (Natural)");
    expect(names[2]).toBe("Google US English");
    expect(names[3]).toBe("Google UK English Female");
    expect(names.at(-1)).toBe("eSpeak English");
  });
  it("Google US English beats local voices when no Natural", () => {
    const pool = voices.filter((v) => !/Natural/.test(v.name));
    expect(pickBrowserVoice(pool, "en")?.name).toBe("Google US English");
  });
  it("filters by language and honours preferred voice", () => {
    expect(pickBrowserVoice(voices, "ru")?.name).toBe("Google русский");
    expect(pickBrowserVoice(voices, "en", "Microsoft Zira - English (United States)")?.name).toContain("Zira");
    expect(pickBrowserVoice(voices, "en", "missing")?.name).toContain("Aria");
    expect(pickBrowserVoice(voices, "de")).toBeNull();
  });
  it("quality tags", () => {
    expect(qualityTag(voices[4])).toBe("HD");
    expect(qualityTag(voices[0])).toBe("STD");
    expect(voiceRank(voices[3])).toBeGreaterThan(voiceRank(voices[1]));
  });
  it("detects language", () => {
    expect(detectLang("hello")).toBe("en");
    expect(detectLang("привет")).toBe("ru");
    expect(detectLang("їжак")).toBe("uk");
    expect(detectLang("Grüße")).toBe("de");
  });
});
