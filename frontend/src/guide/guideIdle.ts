/** Порт stamina/guide_idle.py: мешок без повторов, pick joke|fact, ленивая загрузка JSON.

Эталон desktop: stamina/guide_content/<lang>.json + ShuffleBag / GuideState.
Web: /guide_content/<lang>/{meta,jokes,facts,intros,system}.json (+ /api/guide/…).
*/
import { getLang } from "../i18n";

export type GuideItem = { id: string; text: string };
export type GuideIntros = { joke: GuideItem[]; fact: GuideItem[]; any: GuideItem[] };
export type GuideBagState = { queue: string[]; last?: string | null };
export type GuideIdlePersist = {
  bags: Record<string, GuideBagState>;
  listened: number;
  declined: number;
  decline_streak: number;
  /** ms epoch последнего предложения (intro) */
  last_offer_at: number;
  /** ONLINE-ambient: ms последнего показа в чате */
  last_online_at: number;
  /** ONLINE: шутки/факты в чате при простое агента */
  online_jokes: boolean;
  /** интервал как desktop: 5-10 | 10-20 | 20-40 */
  interval: GuideInterval;
};

export type GuideInterval = "5-10" | "10-20" | "20-40";
export const INTERVALS: Record<GuideInterval, [number, number]> = {
  "5-10": [5, 10],
  "10-20": [10, 20],
  "20-40": [20, 40],
};
export const DEFAULT_INTERVAL: GuideInterval = "10-20";
export const DECLINE_STREAK_SLOWDOWN = 3;
export const TYPING_QUIET_MS = 6000;
/** ONLINE ambient: реже офлайн-гида (не мешать агенту). */
export const ONLINE_COOLDOWN_MS = 15 * 60_000;
export const ONLINE_CHECK_MS = 60_000;

const BAG_KEY = (pilot: string) => `st_guide_idle::${pilot || "guest"}`;

export const DEFAULT_IDLE: GuideIdlePersist = {
  bags: {},
  listened: 0,
  declined: 0,
  decline_streak: 0,
  last_offer_at: 0,
  last_online_at: 0,
  online_jokes: true,
  interval: DEFAULT_INTERVAL,
};

export function loadIdle(pilot: string): GuideIdlePersist {
  try {
    const raw = localStorage.getItem(BAG_KEY(pilot));
    if (!raw) return { ...DEFAULT_IDLE, bags: {} };
    const r = JSON.parse(raw) as Partial<GuideIdlePersist>;
    return {
      bags: r.bags && typeof r.bags === "object" ? { ...r.bags } : {},
      listened: typeof r.listened === "number" ? r.listened : 0,
      declined: typeof r.declined === "number" ? r.declined : 0,
      decline_streak: typeof r.decline_streak === "number" ? r.decline_streak : 0,
      last_offer_at: typeof r.last_offer_at === "number" ? r.last_offer_at : 0,
      last_online_at: typeof r.last_online_at === "number" ? r.last_online_at : 0,
      online_jokes: typeof r.online_jokes === "boolean" ? r.online_jokes : true,
      interval: r.interval && r.interval in INTERVALS ? r.interval : DEFAULT_INTERVAL,
    };
  } catch {
    return { ...DEFAULT_IDLE, bags: {} };
  }
}

export function saveIdle(pilot: string, st: GuideIdlePersist): void {
  try {
    localStorage.setItem(BAG_KEY(pilot), JSON.stringify(st));
  } catch {
    /* private mode */
  }
}

/** Перемешанная очередь: каждый id раз за круг, без повтора на стыке (desktop ShuffleBag). */
export function bagNext(
  st: GuideIdlePersist,
  name: string,
  ids: string[],
  rnd: () => number = Math.random,
): string | null {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return null;
  const bag = st.bags[name] || { queue: [], last: null };
  let q = (bag.queue || []).filter((id) => uniq.includes(id));
  if (!q.length) {
    q = [...uniq];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [q[i], q[j]] = [q[j]!, q[i]!];
    }
    if (q.length > 1 && q[0] === bag.last) {
      [q[0], q[q.length - 1]] = [q[q.length - 1]!, q[0]!];
    }
  }
  const cid = q.shift()!;
  st.bags[name] = { queue: q, last: cid };
  return cid;
}

export function intervalMs(
  setting: GuideInterval,
  declineStreak: number,
  rnd: () => number = Math.random,
): number {
  const [lo, hi] = INTERVALS[setting] || INTERVALS[DEFAULT_INTERVAL];
  let sec = lo * 60 + rnd() * (hi - lo) * 60;
  if (declineStreak >= DECLINE_STREAK_SLOWDOWN) sec *= 2;
  return Math.floor(sec * 1000);
}

export type PickResult = { kind: "joke" | "fact"; introId: string; itemId: string; intro: string; item: string };

type Cache = {
  lang: string;
  jokes?: GuideItem[];
  facts?: GuideItem[];
  intros?: GuideIntros;
  system?: GuideItem[];
  loading?: Promise<void>;
};

const cache: Cache = { lang: "" };

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`guide_content_${r.status}`);
  return (await r.json()) as T;
}

/** Ленивая загрузка категории (static public/ или API fallback). */
export async function ensureCategory(
  cat: "jokes" | "facts" | "intros" | "system",
  lang?: string,
): Promise<void> {
  const code = (lang || getLang() || "ru").split("-")[0] || "ru";
  if (cache.lang !== code) {
    cache.lang = code;
    cache.jokes = undefined;
    cache.facts = undefined;
    cache.intros = undefined;
    cache.system = undefined;
    cache.loading = undefined;
  }
  if (cat === "jokes" && cache.jokes) return;
  if (cat === "facts" && cache.facts) return;
  if (cat === "intros" && cache.intros) return;
  if (cat === "system" && cache.system) return;

  const load = async () => {
    try {
      if (cat === "intros") {
        const d = await fetchJson<{ intros: GuideIntros }>(`/guide_content/${code}/intros.json`);
        cache.intros = d.intros;
      } else {
        const d = await fetchJson<{ items: GuideItem[] }>(`/guide_content/${code}/${cat}.json`);
        if (cat === "jokes") cache.jokes = d.items;
        else if (cat === "facts") cache.facts = d.items;
        else cache.system = d.items;
      }
    } catch {
      /* API fallback */
      const d = await fetchJson<Record<string, unknown>>(`/api/guide/content/${cat}?lang=${code}`);
      if (cat === "intros") cache.intros = d.intros as GuideIntros;
      else if (cat === "jokes") cache.jokes = d.items as GuideItem[];
      else if (cat === "facts") cache.facts = d.items as GuideItem[];
      else cache.system = d.items as GuideItem[];
    }
  };
  await load();
}

function byId(items: GuideItem[] | undefined, id: string): string {
  return items?.find((x) => x.id === id)?.text || "";
}

/** Выбрать (вид, заход, шутка/факт) — desktop guide_idle.pick. */
export async function pickIdle(
  st: GuideIdlePersist,
  rnd: () => number = Math.random,
  lang?: string,
): Promise<PickResult | null> {
  await Promise.all([
    ensureCategory("jokes", lang),
    ensureCategory("facts", lang),
    ensureCategory("intros", lang),
  ]);
  const kind: "joke" | "fact" = rnd() < 0.5 ? "joke" : "fact";
  const items = kind === "joke" ? cache.jokes || [] : cache.facts || [];
  const intros = [...(cache.intros?.[kind] || []), ...(cache.intros?.any || [])];
  const introId = bagNext(st, `intro_${kind}`, intros.map((x) => x.id), rnd);
  const itemId = bagNext(st, kind, items.map((x) => x.id), rnd);
  if (!introId || !itemId) return null;
  return {
    kind,
    introId,
    itemId,
    intro: byId(intros, introId),
    item: byId(items, itemId),
  };
}

export async function systemText(id: string, lang?: string): Promise<string> {
  await ensureCategory("system", lang);
  return byId(cache.system, id);
}

export function contentCounts(): { jokes: number; facts: number } {
  return { jokes: cache.jokes?.length || 0, facts: cache.facts?.length || 0 };
}

/** Можно ли предложить offline-offer сейчас (интервал + typing quiet). */
export function canOfferNow(
  st: GuideIdlePersist,
  ctx: { now: number; lastTypeAt: number; paused?: boolean; jokesOn: boolean; guideOn: boolean },
): "show" | "wait" | "drop" {
  if (!ctx.guideOn || !ctx.jokesOn) return "drop";
  const gap = intervalMs(st.interval, st.decline_streak, () => 0.5); // mid for check
  // для проверки «пора ли» используем нижнюю границу интервала
  const [lo] = INTERVALS[st.interval];
  const minGap = lo * 60_000 * (st.decline_streak >= DECLINE_STREAK_SLOWDOWN ? 2 : 1);
  if (st.last_offer_at && ctx.now - st.last_offer_at < minGap) return "drop";
  if (!ctx.paused && ctx.now - ctx.lastTypeAt < TYPING_QUIET_MS) return "wait";
  void gap;
  return "show";
}

/** ONLINE ambient: агент свободен, кулдаун, шутки вкл. */
export function canOnlineAmbient(
  st: GuideIdlePersist,
  ctx: {
    now: number;
    lastTypeAt: number;
    jokesOn: boolean;
    onlineOn: boolean;
    busy: boolean;
    hasDraft: boolean;
    listening: boolean;
    pendingAnswer: boolean;
  },
): boolean {
  if (!ctx.onlineOn || !ctx.jokesOn) return false;
  if (ctx.busy || ctx.hasDraft || ctx.listening || ctx.pendingAnswer) return false;
  if (ctx.now - ctx.lastTypeAt < TYPING_QUIET_MS) return false;
  if (st.last_online_at && ctx.now - st.last_online_at < ONLINE_COOLDOWN_MS) return false;
  return true;
}

/** Сохранить шутку/факт в чат Ориона (desktop remember shape: role+kind+text). */
export async function rememberAmbient(opts: {
  text: string;
  kind: "joke" | "fact";
  clipId: string;
}): Promise<{ id: number; kind: string; text: string } | null> {
  try {
    const r = await fetch("/api/orion/remember", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "orion",
        text: opts.text,
        kind: opts.kind,
        clip_id: opts.clipId,
        mode: "guide",
      }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { id: number; kind: string; text: string };
  } catch {
    return null;
  }
}
