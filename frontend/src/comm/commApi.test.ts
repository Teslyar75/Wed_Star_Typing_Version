import { afterEach, describe, expect, it, vi } from "vitest";
import { commApi } from "./commApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commApi", () => {
  it("send не кладёт author/pilot_id в тело", async () => {
    const fetch = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      expect(args[1]?.credentials).toBe("include");
      return new Response(
        JSON.stringify({ id: 1, text: "hi", mine: true, callsign: "A", accent: "cyan", ts: 1 }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    await commApi.send("hi");
    const sent = fetch.mock.calls[0][1];
    const body = JSON.parse(String(sent?.body));
    expect(body).toEqual({ text: "hi" });
    expect(body.author).toBeUndefined();
    expect(body.pilot_id).toBeUndefined();
  });
});
