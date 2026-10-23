/** Единый источник таблицы ST+MT: журнал и аккаунт портала читают одно и то же. */
import { create } from "zustand";
import { getStats, mtSync, setMtUser, type PortalStats } from "./portalApi";

export const AUTO_INTERVAL_MS = 5 * 60 * 1000;

type St = {
  stats: PortalStats | null;
  busy: boolean;
  status: "idle" | "loading" | "ok" | "error" | "backoff" | "none";
  error: string;
  retryAt: number | null;
  lastAuto: number;
  load: () => Promise<void>;
  /** auto — с троттлингом 5 мин; force (ручной ↻) — без интервала, но 429-пауза сервера соблюдается */
  sync: (force?: boolean) => Promise<void>;
  setUser: (name: string) => Promise<void>;
  put: (s: PortalStats | null) => void;
};

function apply(set: (p: Partial<St>) => void, s: PortalStats | null) {
  if (!s) { set({ status: "error", error: "network" }); return; }
  const st = s.sync?.status;
  const r = s.sync as { retry_at?: number; error?: string };
  if (!s.mt_username) set({ stats: s, status: "none", error: "" });
  else if (st === "error") set({ stats: s, status: "error", error: r.error || "error" });
  else if (st === "backoff") set({ stats: s, status: "backoff", retryAt: r.retry_at ?? null });
  else set({ stats: s, status: s.fetched_at ? "ok" : "idle", error: "" });
}

export const useMt = create<St>((set, get) => ({
  stats: null, busy: false, status: "idle", error: "", retryAt: null, lastAuto: 0,
  put: (s) => { if (s) apply(set, s); },
  load: async () => { apply(set, await getStats()); },
  sync: async (force = false) => {
    const g = get();
    if (g.busy) return;
    const now = Date.now();
    if (!force && now - g.lastAuto < AUTO_INTERVAL_MS && g.stats) return;
    set({ busy: true, status: "loading", lastAuto: force ? g.lastAuto : now });
    try {
      let s = g.stats ?? (await getStats());
      if (s && !s.mt_username) { apply(set, s); return; }
      s = await mtSync(force);
      apply(set, s);
    } catch (e) {
      set({ status: "error", error: String(e) });
    } finally {
      set({ busy: false });
    }
  },
  setUser: async (name) => {
    set({ busy: true, status: "loading" });
    try { apply(set, await setMtUser(name)); } finally { set({ busy: false }); }
    if (name) await get().sync(true);
  },
}));

export function fmtStamp(sec: number | null | undefined): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
