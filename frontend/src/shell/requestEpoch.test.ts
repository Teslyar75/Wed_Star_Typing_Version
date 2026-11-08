import { describe, expect, it } from "vitest";
import { createEpoch, isAbortError } from "./requestEpoch";

describe("requestEpoch", () => {
  it("invalidate и next делают предыдущий токен просроченным", () => {
    const e = createEpoch();
    const a = e.next();
    expect(e.is(a)).toBe(true);
    const b = e.next();
    expect(e.is(a)).toBe(false);
    expect(e.is(b)).toBe(true);
    e.invalidate();
    expect(e.is(b)).toBe(false);
  });

  it("isAbortError ловит DOMException и Error AbortError", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError("abort")).toBe(false);
  });
});
