// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/setup";
import DocsPanel from "./DocsPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  );
}

beforeAll(async () => {
  await initI18n("ru");
});

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

async function tick() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DocsPanel", () => {
  it("гость видит docs_need_crew, без чужих строк", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo) => {
        if (String(url).includes("/api/docs")) return json({ detail: "login required" }, 401);
        return json({ items: [] });
      }),
    );
    await act(async () => {
      root.render(<DocsPanel />);
    });
    await tick();
    expect(el.querySelector('[data-testid="docs-status"]')?.textContent).toMatch(/экипаж/i);
    expect(el.querySelector('[data-testid="docs-row"]')).toBeNull();
    expect(el.querySelector('[data-testid="docs-new"]')).toHaveProperty("disabled", true);
  });

  it("список своего пилота", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo, init?: RequestInit) => {
        expect(init?.credentials ?? "include").toBe("include");
        const u = String(url);
        if (u.startsWith("/api/docs/templates")) return json({ items: [] });
        if (u.startsWith("/api/docs")) {
          return json({ items: [{ id: 7, title: "бортжурнал", rev: 1, words: 2, updated_at: null }], sort: "updated", trash: false });
        }
        return json({});
      }),
    );
    await act(async () => {
      root.render(<DocsPanel />);
    });
    await tick();
    const row = el.querySelector('[data-testid="docs-row"]');
    expect(row?.textContent).toMatch(/бортжурнал/);
  });
});
