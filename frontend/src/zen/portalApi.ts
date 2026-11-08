import type { ZenResult } from "./zenEngine";

export type Pb = { mode: string; mode2: string; wpm: number | null; acc: number | null; language?: string; src?: string };
export type Summary = {
  name: string; joined: number | null; tests: number; started: number; seconds: number; hours: number;
  streak: number; max_streak?: number; pbs: Pb[]; activity: [string, number][]; both?: Record<string, [number, number]>;
  xp: number; level: number; level_have: number; level_need: number; recent: number[];
};
export type PortalStats = {
  mt_username: string; fetched_at: number | null; ours: Summary; mt: Summary | null; merged: Summary;
  average_pace: number | null; sync: { status?: string; error?: string };
};

const J = { credentials: "include" as const, headers: { "Content-Type": "application/json" } };

async function call(url: string, init?: RequestInit): Promise<PortalStats | null> {
  try {
    const r = await fetch(url, { ...J, ...init });
    return r.ok ? ((await r.json()) as PortalStats) : null;
  } catch {
    return null;
  }
}

export const getStats = () => call("/api/portal/stats");
export const mtSync = (force = false) => call(`/api/portal/mt-sync${force ? "?force=true" : ""}`, { method: "POST" });
export const setMtUser = (username: string) =>
  call("/api/portal/mt-user", { method: "PUT", body: JSON.stringify({ username }) });
export const markStarted = () => void fetch("/api/portal/started", { ...J, method: "POST" }).catch(() => {});
export const postResult = (r: ZenResult) =>
  call("/api/portal/results", {
    method: "POST",
    body: JSON.stringify({ mode: r.mode, mode2: r.mode2, wpm: r.wpm, raw: r.raw, acc: r.acc,
      consistency: r.consistency, time: r.time, chars: r.chars, ts: r.ts }),
  });
