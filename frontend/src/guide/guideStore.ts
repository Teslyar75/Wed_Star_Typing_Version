/** Гид: состояние на пилота (localStorage st_guide::<позывной>) + очередь окон. */
import { create } from "zustand";
import {
  addressOf,
  breakDays,
  canShow,
  daysWord,
  DEFAULT_STATE,
  fill,
  markShown,
  muteTrigger,
  normalize,
  pickLines,
  type GuideState,
} from "./guideLogic";
import {
  canOfferNow,
  loadIdle,
  pickIdle,
  rememberAmbient,
  saveIdle,
  systemText,
  type GuideIdlePersist,
} from "./guideIdle";
import { linesOf } from "./guides";
import { useSkin } from "../theme/skinStore";

const KEY = (pilot: string) => `st_guide::${pilot || "guest"}`;

export function loadGuideState(pilot: string): GuideState {
  try {
    const raw = localStorage.getItem(KEY(pilot));
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveGuideState(pilot: string, st: GuideState): void {
  try {
    localStorage.setItem(KEY(pilot), JSON.stringify(st));
  } catch {
    /* приватный режим */
  }
}

export type GuidePopup = { trigger: string; lines: string[]; idx: number; onYes?: () => void };
type Pending = {
  trigger: string;
  linesKey?: string;
  /** готовые реплики (одна из пула) — иначе берём из файла по trigger/linesKey */
  lines?: string[];
  vars: Record<string, string | number | undefined>;
  skin: string;
  onYes?: () => void;
};

type S = {
  pilot: string;
  st: GuideState;
  popup: GuidePopup | null;
  queue: Pending[];
  lastTypeAt: number;
  paused: boolean;
  setPilot: (pilot: string) => void;
  patch: (p: Partial<GuideState>) => void;
  fire: (trigger: string, opts?: { vars?: Pending["vars"]; skin?: string; onYes?: () => void; linesKey?: string; lines?: string[] }) => void;
  pump: () => void;
  next: () => void;
  close: () => void;
  muteCurrent: () => void;
  noteTyping: (paused?: boolean) => void;
  /** вход пилота: long_break, база звания, отметка визита */
  onEntry: (rank: string | undefined, vars: Pending["vars"], skin: string) => void;
  /** Орион сам вклинивается: тишина → предложение шутки/факта (desktop guide_idle) */
  maybeOfferJoke: () => void;
  /** Сразу рассказать шутку/факт (голосовая команда / кнопка) */
  tellJokeNow: () => boolean;
  /** Состояние мешков / интервал / online-флаг (localStorage) */
  idle: GuideIdlePersist;
  patchIdle: (p: Partial<GuideIdlePersist>) => void;
};

export const useGuide = create<S>((set, get) => {
  const commit = (st: GuideState) => {
    saveGuideState(get().pilot, st);
    set({ st });
  };
  const tryShow = (p: Pending): "done" | "wait" => {
    const { st, lastTypeAt, paused, popup } = get();
    if (popup) return "wait";
    const v = canShow(p.trigger, st, { now: Date.now(), lastTypeAt, paused });
    if (v === "wait") return "wait";
    if (v === "drop") return "done";
    const raw = p.lines?.length ? p.lines : pickLines(p.linesKey || p.trigger, p.skin, linesOf(st.id));
    const lines = raw.map((l) => fill(l, p.vars));
    if (!lines.length) return "done";
    commit(markShown(st, p.trigger, Date.now()));
    set({ popup: { trigger: p.trigger, lines, idx: 0, onYes: p.onYes } });
    return "done";
  };
  const commitIdle = (idle: GuideIdlePersist) => {
    saveIdle(get().pilot, idle);
    set({ idle });
  };
  return {
    pilot: "",
    st: { ...DEFAULT_STATE },
    idle: { ...DEFAULT_IDLE_BAGS() },
    popup: null,
    queue: [],
    lastTypeAt: 0,
    paused: false,
    setPilot: (pilot) =>
      set({ pilot, st: loadGuideState(pilot), idle: loadIdle(pilot), popup: null, queue: [] }),
    patch: (p) => commit({ ...get().st, ...p }),
    patchIdle: (p) => commitIdle({ ...get().idle, ...p }),
    fire: (trigger, opts = {}) => {
      const p: Pending = {
        trigger,
        vars: { pilot: get().pilot, sir: addressOf(), ...opts.vars },
        skin: opts.skin || "spaceship",
        onYes: opts.onYes,
        linesKey: opts.linesKey,
        lines: opts.lines,
      };
      if (get().queue.some((q) => q.trigger === trigger)) return;
      if (tryShow(p) === "wait") set({ queue: [...get().queue, p] });
    },
    pump: () => {
      const q = get().queue;
      if (!q.length || get().popup) return;
      const rest: Pending[] = [];
      let shown = false;
      for (const p of q) {
        if (shown) rest.push(p);
        else if (tryShow(p) === "wait") rest.push(p);
        else shown = !!get().popup;
      }
      set({ queue: rest });
    },
    next: () => {
      const pp = get().popup;
      if (!pp) return;
      if (pp.idx + 1 < pp.lines.length) set({ popup: { ...pp, idx: pp.idx + 1 } });
      else {
        set({ popup: null });
        pp.onYes?.();
      }
    },
    close: () => {
      const pp = get().popup;
      /* Esc на предложении шутки/факта = отказ (desktop guide_idle.decline) */
      if (pp?.trigger === "joke_offer" && pp.onYes) {
        const idle3 = { ...get().idle };
        idle3.declined += 1;
        idle3.decline_streak += 1;
        commitIdle(idle3);
        void systemText("sys_decline").then((t) => {
          if (t) set({ popup: { trigger: "sys_decline", lines: [t], idx: 0 } });
          else set({ popup: null });
        });
        return;
      }
      set({ popup: null });
    },
    muteCurrent: () => {
      const pp = get().popup;
      if (!pp) return;
      commit(muteTrigger(get().st, pp.trigger));
      set({ popup: null });
    },
    noteTyping: (paused) => set({ lastTypeAt: Date.now(), paused: !!paused }),
    onEntry: (rank, vars, skin) => {
      const now = Date.now();
      const st = get().st;
      const days = breakDays(st.last_seen, now);
      commit({ ...get().st, last_seen: now, last_rank: st.last_rank || rank || "" });
      if (days) get().fire("long_break", { vars: { ...vars, days, days_word: daysWord(days) }, skin });
    },
    maybeOfferJoke: () => {
      const { st, popup, queue, pilot, idle, lastTypeAt, paused } = get();
      if (!pilot || !st.jokes || st.id === "none" || popup || queue.length) return;
      const verdict = canOfferNow(idle, {
        now: Date.now(),
        lastTypeAt,
        paused,
        jokesOn: st.jokes,
        guideOn: st.id !== "none",
      });
      if (verdict !== "show") return;
      const skin = useSkin.getState().skin.id;
      void (async () => {
        const next = { ...get().idle, bags: { ...get().idle.bags } };
        const picked = await pickIdle(next);
        if (!picked || !picked.intro || !picked.item) return;
        next.last_offer_at = Date.now();
        commitIdle(next);
        const prompt = await systemText("sys_prompt");
        get().fire("joke_offer", {
          skin,
          lines: [picked.intro, prompt || "Послушаете? Enter — да, Escape — нет."],
          onYes: () => {
            const idle2 = { ...get().idle };
            idle2.listened += 1;
            idle2.decline_streak = 0;
            commitIdle(idle2);
            set({
              popup: {
                trigger: picked.itemId,
                lines: [picked.item],
                idx: 0,
              },
            });
            void rememberAmbient({ text: picked.item, kind: picked.kind, clipId: picked.itemId });
          },
        });
      })();
    },
    tellJokeNow: () => {
      const { st, pilot } = get();
      if (!pilot || st.id === "none") return false;
      void (async () => {
        const next = { ...get().idle, bags: { ...get().idle.bags } };
        const picked = await pickIdle(next);
        if (!picked || !picked.item) return;
        commitIdle(next);
        set({ popup: { trigger: picked.itemId, lines: [picked.item], idx: 0 } });
        void rememberAmbient({ text: picked.item, kind: picked.kind, clipId: picked.itemId });
      })();
      return true;
    },
  };
});

function DEFAULT_IDLE_BAGS(): GuideIdlePersist {
  return loadIdle("");
}
