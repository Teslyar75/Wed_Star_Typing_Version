import { describe, expect, it } from "vitest";
import { DEFAULT_CARGO_OPTS, processText, remapIndex, removePunctuation } from "./processText";
import { prepareWords } from "../zen/zenEngine";

const o = { ...DEFAULT_CARGO_OPTS, glue: false };

describe("фильтры не сращивают слова", () => {
  it.each([
    ["of vague distaste--this was", "of vague distaste this was"],
    ["the Ministry of Truth---Ministry, in Newspeak", "the ministry of truth ministry in newspeak"],
    ["Hello—world", "hello world"],
    ["он сказал—и ушёл", "он сказал и ушёл"],
    ["конец строки.\nНачало", "конец строки начало"],
    ["сло-\nво за словом", "слово за словом"],
    ["a/b, 1.5 and forty-five, don't", "a b 1.5 and forty-five don't"],
    ["«Да,» — сказал он", "да сказал он"],
  ])("%s", (src, out) => {
    expect(processText(src, o)).toBe(out);
  });
  it("без других опций", () => {
    expect(removePunctuation("x--y,z")).toBe("x y z");
  });
  it("glue по умолчанию включён", () => {
    expect(DEFAULT_CARGO_OPTS.glue).toBe(true);
  });
  it("remapIndex", () => {
    // «aa distastethis bb» → «aa distaste this bb»
    expect(remapIndex([[3, 15, 13]], 16)).toBe(17);
  });
  it("портал: знак между буквами — граница слова", () => {
    expect(prepareWords("hello—world it's distaste--this").map((w) => w.word)).toEqual([
      "hello", "world", "it's", "distaste", "this",
    ]);
  });
});
