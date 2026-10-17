/** Гид: чистая логика (без DOM) — можно ли показать окно, какие реплики, подстановки. */

export type GuideFreq = "often" | "normal" | "rare" | "story";

export type GuideState = {
  /** id гида или "none" */
  id: string;
  freq: GuideFreq;
  voice: boolean;
  /** иногда предлагать анекдот (ОРИОН) */
  jokes: boolean;
  seen: string[];
  muted_triggers: string[];
  /** ms epoch последнего показанного окна */
  last_popup: number;
  /** громкость голоса 0…4 */
  volume: number;
  /** личные рекорды (для триггера record) */
  bests: { cpm: number; acc: number };
  /** последнее известное звание (для rank_up) */
  last_rank: string;
  /** последний вход, ms (для long_break) */
  last_seen: number;
  /** когда триггер показан последний раз (кулдауны record / error_streak) */
  last_by: Record<string, number>;
};

export const DEFAULT_STATE: GuideState = {
  id: "ship_ai",
  freq: "normal",
  voice: true,
  jokes: true,
  seen: [],
  muted_triggers: [],
  last_popup: 0,
  volume: 3,
  bests: { cpm: 0, acc: 0 },
  last_rank: "",
  last_seen: 0,
  last_by: {},
};

/** Триггеры вне лимита частоты (Орион сам вклинивается по своему кулдауну). */
export const EXEMPT = new Set(["rank_up", "story", "first_launch", "joke_offer"]);
/** Триггеры «один раз». */
export const ONCE = new Set(["first_launch"]);

/** first_launch, first_zone:* — один раз (на зону). */
export function isOnce(trigger: string): boolean {
  return ONCE.has(trigger) || trigger.startsWith("first_zone:");
}

/** Собственные кулдауны (поверх общего лимита). */
export const COOLDOWN_MS: Record<string, number> = {
  record: 24 * 3600_000,
  error_streak: 15 * 60_000,
  /** шутки — не чаще ~10 мин (разбавляют тишину) */
  joke_offer: 10 * 60_000,
};
const RARE_ONLY_NORMAL = new Set(["error_streak"]);
/** На «Выкл» (story) и при выключенных шутках — без анекдотов. */
const JOKE_TRIGGERS = new Set(["joke_offer", "joke"]);

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
  if (JOKE_TRIGGERS.has(trigger) || trigger.startsWith("joke:")) {
    if (!st.jokes) return "drop";
    if (st.freq === "story") return "drop";
  }
  if (isOnce(trigger) && st.seen.includes(trigger)) return "drop";
  const cd = COOLDOWN_MS[trigger] ?? (trigger.startsWith("joke:") ? COOLDOWN_MS.joke_offer : undefined);
  if (cd && st.last_by[trigger] && ctx.now - st.last_by[trigger]! < cd) return "drop";
  // «редкие» триггеры молчат на частоте «Редко»
  if (RARE_ONLY_NORMAL.has(trigger) && st.freq === "rare") return "drop";
  if (!EXEMPT.has(trigger)) {
    const gap = FREQ_MS[st.freq];
    if (!Number.isFinite(gap)) return "drop";
    if (st.last_popup && ctx.now - st.last_popup < gap) return "drop";
  }
  if (!ctx.paused && ctx.now - ctx.lastTypeAt < TYPING_QUIET_MS) return "wait";
  return "show";
}

/** Сколько анекдотов в файле реплик (ключи joke:0, joke:1, …). */
export function jokeCount(own: LinesFile | undefined): number {
  if (!own) return 0;
  let n = 0;
  while (own[`joke:${n}`]?.default?.length || own[`joke:${n}`]?.spaceship?.length) n += 1;
  return n;
}

export function pickJokeKey(own: LinesFile | undefined, rnd: () => number = Math.random): string | null {
  const n = jokeCount(own);
  if (!n) return null;
  return `joke:${Math.floor(rnd() * n)}`;
}

/** Одна случайная реплика из пула (для вариантов «скучающего» предложения). */
export function pickOneLine(
  trigger: string,
  skin: string,
  own: LinesFile | undefined,
  rnd: () => number = Math.random,
  narrator?: LinesFile,
): string | null {
  const lines = pickLines(trigger, skin, own, narrator);
  if (!lines.length) return null;
  return lines[Math.floor(rnd() * lines.length)] ?? null;
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
  const add = (isOnce(trigger) ? [trigger] : []).concat(IMPLIES[trigger] || []).filter((x) => !st.seen.includes(x));
  return {
    ...st,
    // первый запуск — тоже окно: следующее (зона) не раньше чем через лимит
    last_popup: EXEMPT.has(trigger) && trigger !== "first_launch" ? st.last_popup : now,
    seen: [...st.seen, ...add],
    last_by: COOLDOWN_MS[trigger] ? { ...st.last_by, [trigger]: now } : st.last_by,
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
    bests: {
      cpm: typeof r.bests?.cpm === "number" ? r.bests.cpm : 0,
      acc: typeof r.bests?.acc === "number" ? r.bests.acc : 0,
    },
    last_rank: typeof r.last_rank === "string" ? r.last_rank : "",
    last_seen: typeof r.last_seen === "number" ? r.last_seen : 0,
    last_by: r.last_by && typeof r.last_by === "object" ? { ...r.last_by } : {},
    volume: typeof r.volume === "number" && r.volume >= 0 && r.volume <= 4 ? Math.round(r.volume) : 3,
    jokes: typeof r.jokes === "boolean" ? r.jokes : true,
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

/** «Сбросить показанные подсказки»: всё заново, кроме знакомства (его повторяют отдельной кнопкой). */
export function resetHints(st: GuideState): GuideState {
  return { ...st, seen: st.seen.filter((x) => x === "first_launch"), muted_triggers: [], last_popup: 0 };
}

/** «Повторить знакомство»: first_launch снова не показан. */
export function forgetFirstLaunch(st: GuideState): GuideState {
  return { ...st, seen: st.seen.filter((x) => x !== "first_launch") };
}

export const FREQ_LABELS: { id: GuideFreq; label: string }[] = [
  { id: "often", label: "Часто" },
  { id: "normal", label: "Обычно" },
  { id: "rare", label: "Редко" },
  { id: "story", label: "Выкл" },
];

/* ---------- G3: события ---------- */

export const ERROR_STREAK = 6;
export const LONG_BREAK_DAYS = 3;

/** Рекорд: скорость (при точности ≥ 90%) или точность (≥ 95%). Первая сессия — только база. */
export function checkRecord(
  bests: { cpm: number; acc: number },
  seg: { cpm: number; acc: number; chars: number },
): { kind: "cpm" | "acc" | null; prev: number; bests: { cpm: number; acc: number } } {
  if (seg.chars < 50) return { kind: null, prev: 0, bests };
  const nb = { cpm: bests.cpm, acc: bests.acc };
  let kind: "cpm" | "acc" | null = null;
  let prev = 0;
  if (seg.acc >= 90 && seg.cpm > bests.cpm) {
    if (bests.cpm > 0) {
      kind = "cpm";
      prev = bests.cpm;
    }
    nb.cpm = seg.cpm;
  }
  if (seg.acc >= 95 && seg.acc > bests.acc) {
    if (bests.acc > 0 && !kind) {
      kind = "acc";
      prev = bests.acc;
    }
    nb.acc = seg.acc;
  }
  return { kind, prev, bests: nb };
}

export function breakDays(lastSeen: number, now: number): number {
  if (!lastSeen) return 0;
  const d = Math.floor((now - lastSeen) / 86_400_000);
  return d >= LONG_BREAK_DAYS ? d : 0;
}

export function isRankUp(lastRank: string, rank: string | undefined): boolean {
  return !!lastRank && !!rank && rank !== lastRank;
}

export function daysWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "день";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "дня";
  return "дней";
}
