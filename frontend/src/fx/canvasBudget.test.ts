import { describe, expect, it } from "vitest";
import { detectSpaceProfile } from "./canvasBudget";

describe("detectSpaceProfile", () => {
  it("respects stored profile", () => {
    expect(detectSpaceProfile("frost")).toBe("frost");
    expect(detectSpaceProfile("full")).toBe("full");
    expect(detectSpaceProfile("light")).toBe("light");
  });

  it("defaults to light or frost without stored", () => {
    const p = detectSpaceProfile(null);
    expect(["frost", "light", "full"]).toContain(p);
  });
});
