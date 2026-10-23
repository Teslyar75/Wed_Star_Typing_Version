import { beforeEach, describe, expect, it, vi } from "vitest";
import { fromFrac, loadPos, POS_KEY, savePos, toFrac } from "./radioPos";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});

describe("radioPos", () => {
  beforeEach(() => mem.clear());
  it("roundtrip and clamp to viewport", () => {
    const p = toFrac(400, 100, 200, 100, 1000, 600);
    expect(p).toEqual({ fx: 0.5, fy: 0.2 });
    expect(fromFrac(p, 200, 100, 1000, 600)).toEqual({ x: 400, y: 100 });
    expect(fromFrac({ fx: 1, fy: 1 }, 200, 100, 500, 300)).toEqual({ x: 300, y: 200 });
    expect(toFrac(-50, 9999, 200, 100, 1000, 600)).toEqual({ fx: 0, fy: 1 });
  });
  it("persists and resets", () => {
    expect(loadPos()).toBeNull();
    savePos({ fx: 2, fy: 0.3 });
    expect(loadPos()).toEqual({ fx: 1, fy: 0.3 });
    savePos(null);
    expect(mem.has(POS_KEY)).toBe(false);
    mem.set(POS_KEY, "{bad");
    expect(loadPos()).toBeNull();
  });
});
