import { describe, expect, it } from "vitest";
import { isNewer, markdownToPlain, normalizeVersion, parseSemver } from "./semver";

describe("semver", () => {
  it("normalizes v-prefix", () => {
    expect(normalizeVersion("v0.2.0")).toBe("0.2.0");
  });

  it("parses", () => {
    expect(parseSemver("1.2.3-beta")).toEqual([1, 2, 3]);
  });

  it("compares", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
  });

  it("strips markdown", () => {
    const p = markdownToPlain("## X\n- **a** [b](http://x)\n");
    expect(p).toContain("a");
    expect(p).toContain("b");
    expect(p).not.toContain("http");
  });
});
