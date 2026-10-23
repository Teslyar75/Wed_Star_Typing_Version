import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtStamp, useMt } from "./mtStore";

const base = { mt_username: "Teslyar75", fetched_at: 1800000000, ours: {}, mt: {}, merged: {}, average_pace: null };
let calls: string[] = [];
function mockFetch(impl: (u: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    calls.push(u);
    const body = impl(u);
    if (body instanceof Error) throw body;
    return { ok: true, json: async () => body } as Response;
  }));
}

describe("mtStore", () => {
  beforeEach(() => {
    calls = [];
    useMt.setState({ stats: null, busy: false, status: "idle", error: "", retryAt: null, lastAuto: 0 });
  });
  it("auto sync is throttled, manual ↻ forces", async () => {
    mockFetch(() => ({ ...base, sync: { status: "ok" } }));
    await useMt.getState().sync();
    await useMt.getState().sync();
    expect(calls.filter((c) => c.includes("mt-sync")).length).toBe(1);
    await useMt.getState().sync(true);
    expect(calls.at(-1)).toContain("force=true");
    expect(useMt.getState().status).toBe("ok");
    expect(useMt.getState().busy).toBe(false);
  });
  it("busy always reset on network error, status error", async () => {
    mockFetch(() => new Error("down"));
    await useMt.getState().sync(true);
    expect(useMt.getState().busy).toBe(false);
    expect(useMt.getState().status).toBe("error");
  });
  it("429 backoff is reported even on manual", async () => {
    mockFetch(() => ({ ...base, sync: { status: "backoff", retry_at: 1800000900 } }));
    await useMt.getState().sync(true);
    expect(useMt.getState().status).toBe("backoff");
    expect(useMt.getState().busy).toBe(false);
  });
  it("stamp DD.MM HH:MM", () => {
    expect(fmtStamp(null)).toBe("—");
    expect(fmtStamp(1800000000)).toMatch(/^\d\d\.\d\d \d\d:\d\d$/);
  });
});
