/** Гид: состояние на пилота (localStorage st_guide::<позывной>) + очередь окон. */
import { create } from "zustand";
import { addressOf, breakDays, canShow, daysWord, DEFAULT_STATE, fill, markShown, muteTrigger, normalize, pickLines, type GuideState } from "./guideLogic";
import { linesOf } from "./guides";

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
type Pending = { trigger: string; linesKey?: string; vars: Record<string, string | number | undefined>; skin: string; onYes?: () => void };

type S = {
  pilot: string;
  st: GuideState;
  popup: GuidePopup | null;
  queue: Pending[];
  lastTypeAt: number;
  paused: boolean;
  setPilot: (pilot: string) => void;
  patch: (p: Partial<GuideState>) => void;
  fire: (trigger: string, opts?: { vars?: Pending["vars"]; skin?: string; onYes?: () => void; linesKey?: string }) => void;
  pump: () => void;
  next: () => void;
  close: () => void;
  muteCurrent: () => void;
  noteTyping: (paused?: boolean) => void;
  /** вход пилота: long_break, база звания, отметка визита */
  onEntry: (rank: string | undefined, vars: Pending["vars"], skin: string) => void;
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
    const lines = pickLines(p.linesKey || p.trigger, p.skin, linesOf(st.id)).map((l) => fill(l, p.vars));
    if (!lines.length) return "done";
    commit(markShown(st, p.trigger, Date.now()));
    set({ popup: { trigger: p.trigger, lines, idx: 0, onYes: p.onYes } });
    return "done";
  };
  return {
    pilot: "",
    st: { ...DEFAULT_STATE },
    popup: null,
    queue: [],
    lastTypeAt: 0,
    paused: false,
    setPilot: (pilot) => set({ pilot, st: loadGuideState(pilot), popup: null, queue: [] }),
    patch: (p) => commit({ ...get().st, ...p }),
    fire: (trigger, opts = {}) => {
      const p: Pending = { trigger, vars: { pilot: get().pilot, sir: addressOf(), ...opts.vars }, skin: opts.skin || "spaceship", onYes: opts.onYes, linesKey: opts.linesKey };
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
    close: () => set({ popup: null }),
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
  };
});
