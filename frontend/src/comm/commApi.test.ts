import { afterEach, describe, expect, it, vi } from "vitest";
import { commApi, exportCommBlob, filterComm, type CommMsg } from "./commApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commApi", () => {
  it("send не кладёт author/pilot_id в тело", async () => {
    const fetch = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      expect(args[1]?.credentials).toBe("include");
      return new Response(
        JSON.stringify({ id: 1, text: "hi", mine: true, callsign: "A", accent: "cyan", ts: 1, images: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    await commApi.send("hi");
    const sent = fetch.mock.calls[0][1];
    const body = JSON.parse(String(sent?.body));
    expect(body).toEqual({ text: "hi", images: [] });
    expect(body.author).toBeUndefined();
    expect(body.pilot_id).toBeUndefined();
  });
});

const sample: CommMsg[] = [
  { id: 1, callsign: "Alpha", accent: "cyan", text: "ping hello", images: [], ts: 1, mine: true },
  { id: 2, callsign: "Beta", accent: "amber", text: "pong world", images: ["data:image/png;base64,xx"], ts: 2, mine: false },
];

describe("comm helpers", () => {
  it("filters by text and callsign", () => {
    expect(filterComm(sample, "pong")).toHaveLength(1);
    expect(filterComm(sample, "alpha")).toHaveLength(1);
    expect(filterComm(sample, "")).toHaveLength(2);
  });

  it("exports txt/md/html", () => {
    expect(exportCommBlob(sample, "txt").name.endsWith(".txt")).toBe(true);
    expect(exportCommBlob(sample, "md").name.endsWith(".md")).toBe(true);
    expect(exportCommBlob(sample, "html").name.endsWith(".html")).toBe(true);
  });
});
