import { afterEach, describe, expect, it, vi } from "vitest";
import { docsApi, DocsHttpError, pageOf, saveAppliesTo, wordCount } from "./docsApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("docsApi helpers", () => {
  it("late save does not apply to another open doc", () => {
    expect(saveAppliesTo(2, 1)).toBe(false);
    expect(saveAppliesTo(1, 1)).toBe(true);
    expect(saveAppliesTo(null, 1)).toBe(false);
  });

  it("pageOf clamps", () => {
    expect(pageOf([1, 2, 3, 4, 5], 9, 2)).toEqual({ rows: [5], pages: 3, page: 2 });
  });

  it("wordCount", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  раз  два три ")).toBe(3);
  });
});

describe("docsApi http", () => {
  it("does not send client pilot_id on create", async () => {
    const fetch = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      expect(args[1]?.credentials).toBe("include");
      return new Response(JSON.stringify({ id: 1, title: "t", body: "", rev: 1, words: 0 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    await docsApi.create("t", "x");
    const sent = fetch.mock.calls[0][1];
    const body = JSON.parse(String(sent?.body));
    expect(body).toEqual({ title: "t", body: "x" });
    expect(body.pilot_id).toBeUndefined();
  });

  it("maps 409 to DocsHttpError with server doc", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: { code: "conflict", doc: { id: 4, title: "A", body: "two", rev: 2, words: 1 } } }), {
          status: 409,
        }),
      ),
    );
    await expect(docsApi.save(4, "A", "lost", 1)).rejects.toMatchObject({
      status: 409,
      code: "conflict",
      doc: { body: "two" },
    });
    await expect(docsApi.save(4, "A", "lost", 1)).rejects.toBeInstanceOf(DocsHttpError);
  });
});
