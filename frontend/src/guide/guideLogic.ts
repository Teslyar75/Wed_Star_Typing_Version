/** Гид: чистая логика (без DOM) — можно ли показать окно, какие реплики, подстановки. */

export type GuideFreq = "often" | "normal" | "rare" | "story";

export type GuideState = {
  /** id гида или "none" */
  id: string;
  freq: GuideFreq;
  voice: boolean;
  seen: string[];
  muted_triggers: string[];
  /** ms epoch последнего показанного окна */
  last_popup: number;
};

export const DEFAULT_STATE: GuideState = {
  id: "ship_ai",
  freq: "normal",
  voice: true,
  seen: [],
  muted_triggers: [],
  last_popup: 0,
};

/** Триггеры вне лимита частоты. */
export const EXEMPT = new Set(["rank_up", "story", "first_launch"]);
/** Триггеры «один раз». */
export const ONCE = new Set(["first_launch"]);

/** first_launch, first_zone:* — один раз (на зону). */
export function isOnce(trigger: string): boolean {
  return ONCE.has(trigger) || trigger.startsWith("first_zone:");
}

export const FREQ_MS: Record<GuideFreq, number> = {
  often: 5 * 60_000,
  normal: 10 * 60_000,
  rare: 30 * 60_000,
  story: Infinity,
};

/** Пауза в наборе, после которой окно уже не мешает. */
export const TYPING_QUIET_MS = 4000;

export type ShowCtx = { now: number; lastTypeAt: number; paused?: boolean };

export type Verdict = "show" | "wait" | "drop";

/** show — сейчас; wait — в очередь (идёт набор); drop — не показывать. */
export function canShow(trigger: string, st: GuideState, ctx: ShowCtx): Verdict {
  if (st.id === "none") return "drop";
  if (st.muted_triggers.includes(trigger)) return "drop";
  if (isOnce(trigger) && st.seen.includes(trigger)) return "drop";
  if (!EXEMPT.has(trigger)) {
    const gap = FREQ_MS[st.freq];
    if (!Number.isFinite(gap)) return "drop";
    if (st.last_popup && ctx.now - st.last_popup < gap) return "drop";
  }
  if (!ctx.paused && ctx.now - ctx.lastTypeAt < TYPING_QUIET_MS) return "wait";
  return "show";
}

export type LinesFile = Record<string, Record<string, string[]>>;

/** guide/skin → guide/default → narrator/skin → narrator/default. */
export function pickLines(trigger: string, skin: string, own: LinesFile | undefined, narrator?: LinesFile): string[] {
  for (const f of [own, narrator]) {
    const t = f?.[trigger];
    if (!t) continue;
    if (t[skin]?.length) return t[skin]!;
    if (t.default?.length) return t.default;
  }
  return [];
}

export function fill(line: string, vars: Record<string, string | number | undefined>): string {
  return line.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Что ещё считать показанным вместе с триггером (первый запуск уже рассказал о мостике). */
const IMPLIES: Record<string, string[]> = { first_launch: ["first_zone:bridge"] };

export function markShown(st: GuideState, trigger: string, now: number): GuideState {
  const add = [trigger, ...(IMPLIES[trigger] || [])].filter((x) => !st.seen.includes(x));
  return {
    ...st,
    // первый запуск — тоже окно: следующее (зона) не раньше чем через лимит
    last_popup: EXEMPT.has(trigger) && trigger !== "first_launch" ? st.last_popup : now,
    seen: [...st.seen, ...add],
  };
}

export function muteTrigger(st: GuideState, trigger: string): GuideState {
  return st.muted_triggers.includes(trigger) ? st : { ...st, muted_triggers: [...st.muted_triggers, trigger] };
}

export function normalize(raw: unknown): GuideState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<GuideState>;
  return {
    id: typeof r.id === "string" ? r.id : DEFAULT_STATE.id,
    freq: r.freq && r.freq in FREQ_MS ? r.freq : DEFAULT_STATE.freq,
    voice: typeof r.voice === "boolean" ? r.voice : true,
    seen: Array.isArray(r.seen) ? r.seen.filter((x) => typeof x === "string") : [],
    muted_triggers: Array.isArray(r.muted_triggers) ? r.muted_triggers.filter((x) => typeof x === "string") : [],
    last_popup: typeof r.last_popup === "number" ? r.last_popup : 0,
  };
}

/** Обращение ОРИОНа: «сэр» по умолчанию; если в профиле есть пол — «сэр»/«мэм», иначе нейтральное «пилот». */
export function addressOf(gender?: string | null): string {
  if (gender === undefined || gender === null || gender === "") return "сэр";
  const g = gender.toLowerCase();
  if (g === "m" || g === "male" || g === "м") return "сэр";
  if (g === "f" || g === "female" || g === "ж") return "мэм";
  return "пилот";
}
