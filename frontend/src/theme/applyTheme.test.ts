import { describe, expect, it } from "vitest";
import { applyTheme } from "./applyTheme";

describe("applyTheme", () => {
  it("sets CSS variables from theme colors", () => {
    applyTheme({
      id: "test",
      colors: { bg: "#010101", accent: "#abcdef" },
    });
    expect(getComputedStyle(document.documentElement).getPropertyValue("--st-bg").trim()).toBe(
      "#010101",
    );
    expect(getComputedStyle(document.documentElement).getPropertyValue("--st-accent").trim()).toBe(
      "#abcdef",
    );
  });
});
