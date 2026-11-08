// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/setup";
import { EN_PAGES } from "../shell/routes";
import { EN_SURFACE } from "./EnglishPanel";
import type { EnPage } from "./types";

vi.mock("./asr", () => ({
  preloadVosk: vi.fn(),
  asrAvailable: vi.fn(async () => ({ ok: false, engine: "none" })),
  listenOnce: vi.fn(),
}));
vi.mock("./serverAsr", () => ({
  serverAsrAvailable: vi.fn(async () => ({ ok: false, reason: "no model" })),
  listenOnceServer: vi.fn(),
}));

import EnglishPanel from "./EnglishPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response);
}

function aborted(init?: RequestInit): Promise<Response> {
  const err = () => new DOMException("Aborted", "AbortError");
  if (init?.signal?.aborted) return Promise.reject(err());
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(err()));
  });
}

function stubFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    if (url.includes("/english/seed")) {
      return aborted(init);
    }
    if (url.includes("/english/progress")) {
      return ok({
        xp: 0,
        rank: "—",
        favorite: 0,
        learned: 0,
        inbox: 0,
        due: 0,
        streak_days: 0,
        best_streak: 0,
        daily_goal: 30,
        xp_today: 0,
        new_available: 20,
        level: 1,
        level_lo: 0,
        level_hi: 100,
        vocab_total: 0,
      });
    }
    if (url.includes("/english/settings")) return ok({});
    if (url.includes("/english/warehouse")) return ok([]);
    if (url.includes("/english/book/hub")) return ok([]);
    if (url.includes("/english/sets")) return ok([]);
    if (url.includes("/english/lists")) return ok([]);
    if (url.includes("/english/lookup")) {
      return ok({ id: 1, word: "orbit", translation: "орбита", example: "in orbit" });
    }
    if (url.includes("/english/word-of-day")) return ok({ word: "orbit" });
    if (url.includes("/english/set/")) return ok({ items: [], total: 0 });
    if (url.includes("/english/missions/start")) return ok({ tasks: [], title: "M" });
    if (url.includes("/english/journal") || url.includes("/english/log")) return ok({});
    return ok([]);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("EnglishPanel — только активная подстраница в DOM", () => {
  let el: HTMLDivElement;
  let root: Root;
  let mounted = false;

  beforeAll(async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    await initI18n("ru");
    globalThis.fetch = prev;
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", stubFetch());
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    mounted = true;
    await act(async () => {
      root.render(<EnglishPanel />);
    });
    await flush();
  });

  afterEach(() => {
    if (mounted) {
      root.unmount();
      mounted = false;
    }
    el.remove();
    vi.unstubAllGlobals();
  });

  it("каждая EN-страница монтирует свою поверхность и снимает остальные", async () => {
    const panel = el.querySelector("[data-testid=en-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("data-en-page")).toBe("overview");
    expect(el.querySelector(".en-overview-grid")).not.toBeNull();

    for (const id of EN_PAGES) {
      const btn = el.querySelector(`[data-en-nav="${id}"]`) as HTMLButtonElement;
      expect(btn, `nav ${id}`).toBeTruthy();
      await act(async () => {
        btn.click();
      });
      await flush();
      expect(panel.getAttribute("data-en-page")).toBe(id);
      const others = (EN_PAGES as readonly EnPage[]).filter((p) => p !== id);
      for (const o of others) {
        const hit = el.querySelector(EN_SURFACE[o]);
        expect(hit, `hidden ${o} while ${id}`).toBeNull();
      }
      expect(el.querySelector(EN_SURFACE[id]), `active ${id}`).not.toBeNull();
    }
  });

  it("unmount абортит фоновый seed (AbortError, без setState)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof stubFetch>;
    const seedCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/english/seed"));
    expect(seedCall).toBeTruthy();
    const signal = (seedCall?.[1] as RequestInit | undefined)?.signal;
    expect(signal).toBeTruthy();
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      root.unmount();
    });
    mounted = false;
    expect(signal?.aborted).toBe(true);
  });
});
