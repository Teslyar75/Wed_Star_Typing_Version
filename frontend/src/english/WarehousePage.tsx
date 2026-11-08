/** Склад карточек — качество 5/10/15/20 слотов, как на десктопе. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import MicTransmit from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import { speakUtterance } from "./speak";
import { ITEM_OK, passed, scheduleAdvance } from "./speechStd";
import type { EnWord } from "./types";

type Bin = "shelf" | "away" | "done" | "today";
type Mode = "C" | "B" | "D";

type Counts = { shelf: number; away: number; done: number; today: number };

type Props = {
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  defaultGoal?: number;
  onOpenScanner?: () => void;
};

type QResp = {
  result?: string;
  key?: string | null;
  need?: number | null;
  filled?: number;
  goal?: number;
  hint?: string;
  by?: Record<string, number[]>;
  done_keys?: string[];
  left_today?: number;
  complete?: boolean;
  stars?: number;
  avg?: number;
  state?: string;
  cap?: number;
};

const EMPTY_COUNTS: Counts = { shelf: 0, away: 0, done: 0, today: 0 };
const GOALS = [5, 10, 15, 20];
const WORD_KEY = -1;

function starsGlyph(n: number): string {
  const k = Math.max(0, Math.min(3, n | 0));
  return "★".repeat(k) + "☆".repeat(3 - k);
}

function parsePayload(j: unknown): { cards: EnWord[]; counts: Counts; cap: number } {
  if (Array.isArray(j)) {
    return { cards: j as EnWord[], counts: EMPTY_COUNTS, cap: 4 };
  }
  const o = (j || {}) as { cards?: EnWord[]; counts?: Partial<Counts>; cap?: number };
  return {
    cards: Array.isArray(o.cards) ? o.cards : [],
    counts: { ...EMPTY_COUNTS, ...(o.counts || {}) },
    cap: Number(o.cap ?? 4),
  };
}

export default function WarehousePage({ onDuck, ttsRate = 1, defaultGoal = 20, onOpenScanner }: Props) {
  const [bin, setBin] = useState<Bin>("shelf");
  const [diff, setDiff] = useState<number | null>(null);
  const [cards, setCards] = useState<EnWord[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [cap, setCap] = useState(4);
  const [open, setOpen] = useState<EnWord | null>(null);
  const [hint, setHint] = useState(false);
  const [mode, setMode] = useState<Mode>("C");
  const [activeSi, setActiveSi] = useState(WORD_KEY);
  const activeRef = useRef(WORD_KEY);
  activeRef.current = activeSi;
  const [checked, setChecked] = useState<boolean[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const keepRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const q = diff ? `&diff=${diff}` : "";
    const r = await fetch(`/api/english/warehouse/cards?state=${bin}${q}`, { credentials: "include" });
    const j = parsePayload(await r.json());
    setCards(j.cards);
    setCounts(j.counts);
    setCap(j.cap);
    const keep = keepRef.current;
    keepRef.current = null;
    if (keep != null) {
      setOpen(j.cards.find((c) => c.id === keep) || null);
    } else {
      setOpen(null);
    }
  }, [bin, diff]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCard = (c: EnWord) => {
    const n = Math.max(1, (c.sentences || []).length);
    setChecked(Array.from({ length: n }, () => true));
    setScores({});
    setActiveSi(WORD_KEY);
    setHint(false);
    setMode("C");
    setMsg("");
    setOpen(c);
  };

  const move = async (wordId: number, st: "shelf" | "away" | "done") => {
    await fetch("/api/english/warehouse/move", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: wordId, state: st }),
    });
    void reload();
  };

  const setQualityGoal = async (n: number) => {
    if (!open) return;
    const r = await fetch("/api/english/warehouse/goal", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: open.id, goal: n }),
    });
    const j = (await r.json()) as { goal?: number; filled?: number };
    setOpen({ ...open, q_goal: j.goal ?? n, q_filled: j.filled ?? open.q_filled, wh_goal: j.goal ?? n });
  };

  const expectedEn = (): string => {
    if (!open) return "";
    if (activeSi === WORD_KEY) return open.word;
    const s = open.sentences?.[activeSi];
    return s?.en || open.word;
  };

  const displayRu = (si: number): string => {
    if (!open) return "";
    if (si === WORD_KEY) return open.translation || open.my_tr || "—";
    const s = open.sentences?.[si];
    return s?.ru || "—";
  };

  useEffect(() => {
    if (!open || mode !== "D" || activeSi < 0) return;
    const en = expectedEn();
    if (!en) return;
    onDuck?.(true);
    speakUtterance({
      text: en,
      lang: "en-US",
      rate: ttsRate,
      onEnd: () => onDuck?.(false),
      onError: () => onDuck?.(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, mode, activeSi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onScore = async (sc: number) => {
    if (!open || busy) return;
    const next = { ...scores, [activeSi]: Math.max(scores[activeSi] || 0, sc) };
    setScores(next);
    if (!passed(sc)) {
      setMsg(t("en_wh_need").replace("{0}", String(sc)).replace("{1}", String(ITEM_OK)));
      return;
    }
    const group = activeSi === WORD_KEY ? "A" : mode === "B" ? "B" : mode === "D" ? "D" : "C";
    setBusy(true);
    try {
      const r = await fetch("/api/english/warehouse/quality", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word_id: open.id,
          group,
          score: sc,
          si: activeSi >= 0 ? activeSi : null,
          self_rated: false,
        }),
      });
      const j = (await r.json()) as QResp;
      if (j.result === "cap") {
        setMsg(t("en_wh_cap").replace("{0}", String(j.cap ?? cap)));
      } else if (j.result === "low") {
        setMsg(t("en_wh_need_slot").replace("{0}", String(j.need ?? ITEM_OK)).replace("{1}", String(sc)));
      } else if (j.result === "ok" || j.result === "self") {
        setMsg(t("en_wh_slot_ok").replace("{0}", String(j.filled ?? 0)).replace("{1}", String(j.goal ?? 20)));
        setOpen({
          ...open,
          q_filled: j.filled ?? open.q_filled,
          q_goal: j.goal ?? open.q_goal,
          q_hint: j.hint ?? open.q_hint,
          q_by: j.by ?? open.q_by,
          q_done_keys: j.done_keys ?? open.q_done_keys,
          left_today: j.left_today ?? open.left_today,
          wh_stars: j.stars ?? open.wh_stars,
          wh_avg: j.avg ?? open.wh_avg,
          wh_state: j.state ?? open.wh_state,
        });
      }
      if (j.complete) {
        setMsg(
          t("en_wh_cleared")
            .replace("{0}", starsGlyph(j.stars || 1))
            .replace("{1}", String(Math.round(j.avg || 0))),
        );
        keepRef.current = open.id;
        setBin("done");
        return;
      }
      const sents = open.sentences || [];
      const here = activeSi;
      const nxt = [WORD_KEY, ...sents.map((_, i) => i)].find((idx) => {
        if (idx === here) return false;
        if (idx >= 0 && !checked[idx]) return false;
        return (next[idx] ?? 0) < ITEM_OK;
      });
      if (nxt != null) {
        scheduleAdvance(() => setActiveSi(nxt), () => activeRef.current === here);
      }
    } finally {
      setBusy(false);
    }
  };

  const shuffle = () => {
    setCards((prev) => {
      const a = [...prev];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  };

  const openNext = () => {
    if (!open || !cards.length) return;
    const i = cards.findIndex((c) => c.id === open.id);
    if (i < 0) {
      setOpen(null);
      return;
    }
    openCard(cards[(i + 1) % cards.length]);
  };

  const strip = useMemo(() => {
    if (open) {
      const filled = open.q_filled || 0;
      const goal = open.q_goal || defaultGoal;
      return {
        title: t("en_wh_quality"),
        hint: t("en_wh_quality_hint"),
        meta: `${filled} / ${goal} · ${open.q_hint || ""}`,
        frac: goal ? filled / goal : 0,
      };
    }
    const n = cards.length;
    if (bin === "away") {
      return {
        title: `${t("en_wh_away")} · ${n}`,
        hint: t("en_wh_away_hint"),
        meta: t("en_wh_shelf_done").replace("{0}", String(counts.shelf)).replace("{1}", String(counts.done)),
        frac: 0,
      };
    }
    if (bin === "done") {
      return {
        title: `${t("en_wh_done")} · ${n}`,
        hint: t("en_wh_done_hint"),
        meta: t("en_wh_shelf_work").replace("{0}", String(counts.shelf)).replace("{1}", String(counts.away)),
        frac: n ? 1 : 0,
      };
    }
    if (bin === "today") {
      return {
        title: t("en_wh_today").replace("{0}", String(n)),
        hint: t("en_wh_today_hint"),
        meta: t("en_wh_in_work").replace("{0}", String(counts.away)).replace("{1}", String(counts.done)),
        frac: 0,
      };
    }
    return {
      title: t("en_wh_strip_title").replace("{0}", String(n)),
      hint: t("en_wh_strip_hint"),
      meta: t("en_wh_in_work").replace("{0}", String(counts.away)).replace("{1}", String(counts.done)),
      frac: 0,
    };
  }, [open, cards.length, bin, counts, defaultGoal]);

  const emptyText = () => {
    if (bin === "away") return t("en_wh_empty_away");
    if (bin === "done") return t("en_wh_empty_done");
    if (bin === "today") return t("en_wh_empty_today");
    return t("en_wh_empty");
  };

  if (open) {
    const sents = open.sentences || [];
    const filled = open.q_filled || 0;
    const goal = open.q_goal || defaultGoal;
    const done = (open.wh_state || "") === "done";
    const remain = Math.max(0, goal - filled);
    const activeLabel =
      activeSi === WORD_KEY
        ? t("en_wh_active")
        : mode === "B"
          ? t("en_wh_active_read")
          : mode === "D"
            ? t("en_wh_active_audio")
            : t("en_wh_active");
    const show = hint ? expectedEn() : displayRu(activeSi);
    const slotN = 20;
    const nextSlot = filled;
    const legend = (["A", "B", "C", "D", "E"] as const)
      .map((g) => {
        const pair = (open.q_by || {})[g] || [0, 0];
        const n = Number(pair[1] || 0);
        if (!n) return "";
        const title = t(`en_wh_grp_${g.toLowerCase()}`);
        return `${title} ${pair[0] || 0}/${n}`;
      })
      .filter(Boolean)
      .join(" · ");
    return (
      <section className="en-wh-card">
        <div className="en-wh-strip">
          <strong>{strip.title}</strong>
          <span className="muted">{strip.hint}</span>
          <span className="en-wh-frac">{strip.meta}</span>
        </div>
        <div className="bridge-actions">
          <button type="button" className="hud-btn" onClick={() => setOpen(null)}>
            {t("en_wh_list_btn")}
          </button>
          {done || bin === "done" ? (
            <button type="button" className="hud-btn" onClick={() => void move(open.id, "shelf")}>
              {t("en_wh_to_shelf")}
            </button>
          ) : bin === "away" || open.wh_state === "away" ? (
            <button type="button" className="hud-btn" onClick={() => void move(open.id, "shelf")}>
              {t("en_wh_to_shelf")}
            </button>
          ) : (
            <button type="button" className="hud-btn" onClick={() => void move(open.id, "away")}>
              {t("en_wh_to_work")}
            </button>
          )}
          <span className="muted en-wh-rank">
            #{open.rank || 0} · {(open.pos || "").toUpperCase()}
          </span>
        </div>
        {!done && (
          <>
            <div className="en-wh-qrow">
              <span className="muted">{t("en_wh_q_label")}</span>
              {GOALS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hud-btn en-wh-goal ${n === goal ? "amber" : ""}`}
                  onClick={() => void setQualityGoal(n)}
                >
                  {n}
                </button>
              ))}
              <strong className="en-wh-qfrac">
                {filled} / {goal}
              </strong>
              <span className="muted">{legend}</span>
            </div>
            <div className="en-wh-slots" aria-hidden>
              {Array.from({ length: slotN }, (_, i) => {
                const on = i < filled;
                const nxt = i === nextSlot && !on;
                return <i key={i} className={`en-wh-slot${on ? " on" : ""}${nxt ? " nxt" : ""}`} />;
              })}
            </div>
            <div className="en-wh-qrow">
              <span className="muted">{t("en_wh_mode")}</span>
              {(["C", "B", "D"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`hud-btn ${mode === m ? "amber" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {t(`en_wh_mode_${m.toLowerCase()}`)}
                </button>
              ))}
              <span className="muted">{t(`en_wh_mode_${mode.toLowerCase()}_h`)}</span>
            </div>
          </>
        )}
        <div className="en-wh-work">
          <div className="en-wh-col">
            {done && (
              <div className="en-wh-banner">
                <strong>{t("en_wh_done_banner")}</strong>
                <div className="en-wh-stars">{starsGlyph(open.wh_stars || 0)}</div>
                <p className="muted">
                  {t("en_wh_stars_legend")
                    .replace("{0}", String(Math.round(open.wh_avg || 0)))
                    .replace("{1}", String(filled))
                    .replace("{2}", String(goal))}
                </p>
              </div>
            )}
            <button
              type="button"
              className={`en-wh-line ${activeSi === WORD_KEY ? "on" : ""}`}
              onClick={() => setActiveSi(WORD_KEY)}
            >
              <span>
                <span className="muted en-wh-k">{t("en_wh_word_say")}</span>
                <strong>{hint && activeSi === WORD_KEY ? open.word : displayRu(WORD_KEY)}</strong>
                <span className="en-wh-en">{open.word}</span>
              </span>
              <span className="muted">{scores[WORD_KEY] != null ? `${scores[WORD_KEY]}%` : t("en_wh_check")}</span>
            </button>
            {sents.map((s, idx) => {
              const on = checked[idx] ?? false;
              const active = activeSi === idx && on;
              const showEn = done || (mode === "B" && on);
              return (
                <div key={idx} className={`en-wh-sent-row ${active ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const nx = [...checked];
                      nx[idx] = e.target.checked;
                      setChecked(nx);
                    }}
                  />
                  <button type="button" className={`en-wh-line ${active ? "on" : ""}`} onClick={() => on && setActiveSi(idx)}>
                    <span>
                      {hint && activeSi === idx ? s.en : s.ru || s.en}
                      {showEn && <span className="en-wh-en">{s.en}</span>}
                    </span>
                    <span className="muted">
                      {scores[idx] != null ? `${scores[idx]}%` : on ? t("en_wh_check") : t("en_wh_off")}
                    </span>
                  </button>
                </div>
              );
            })}
            {!done && (
              <p className="muted en-wh-remain">
                {t("en_wh_remain")
                  .replace("{0}", String(remain))
                  .replace("{1}", String(goal))
                  .replace("{2}", open.q_hint || "")}
              </p>
            )}
          </div>
          <div className="en-wh-side">
            <p className="muted en-wh-k">{activeLabel}</p>
            <p className="en-wh-active-face">{show || t("en_wh_pick")}</p>
            <div className="bridge-actions">
              <button
                type="button"
                className="hud-btn"
                onPointerDown={() => setHint(true)}
                onPointerUp={() => setHint(false)}
                onPointerLeave={() => setHint(false)}
              >
                {t("en_hint_hold")}
              </button>
              <SpeakButton text={expectedEn()} rate={ttsRate} onDuck={onDuck} label={t("en_speak_en")} lang="en-US" />
            </div>
            <MicTransmit expected={expectedEn()} targetWord={open.word} onDuck={onDuck} onResult={(sc) => void onScore(sc)} />
            {msg && <p className="muted">{msg}</p>}
          </div>
        </div>
        <div className="bridge-actions">
          <button type="button" className="hud-btn" onClick={() => setOpen(null)}>
            {t("en_wh_list_btn")}
          </button>
          <button type="button" className="hud-btn amber" onClick={openNext}>
            {t("en_wh_next")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="en-warehouse">
      <div className="en-wh-strip">
        <strong>{strip.title}</strong>
        <span className="muted">{strip.hint}</span>
        <span className="en-wh-frac">{strip.meta}</span>
      </div>
      <div className="bridge-actions en-wh-tabs">
        {(
          [
            ["shelf", "en_wh_shelf", counts.shelf],
            ["away", "en_wh_away", counts.away],
            ["done", "en_wh_done", counts.done],
            ["today", "en_wh_today", counts.today],
          ] as const
        ).map(([st, key, n]) => (
          <button key={st} type="button" className={`hud-btn ${bin === st ? "amber" : ""}`} onClick={() => setBin(st)}>
            {st === "today" ? t(key).replace("{0}", String(n)) : `${t(key)}${n ? ` (${n})` : ""}`}
          </button>
        ))}
        <span className="muted">{t("en_wh_diff")}</span>
        <button type="button" className={`hud-btn ${diff == null ? "amber" : ""}`} onClick={() => setDiff(null)}>
          {t("en_all")}
        </button>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" className={`hud-btn ${diff === n ? "amber" : ""}`} onClick={() => setDiff(n)}>
            {"★".repeat(n)}
          </button>
        ))}
      </div>
      <ul className="en-wh-list">
        {cards.map((c) => {
          const nS = c.n_sents || (c.sentences || []).length;
          const dN = c.difficulty_n || Math.max(1, Math.min(3, nS));
          const meta = `#${c.rank || 0} · ${(c.pos || "").toUpperCase()} · ${"★".repeat(Math.min(3, dN))} · ${t("en_wh_sents").replace("{0}", String(nS))}`;
          const qmeta =
            bin === "done" || c.wh_state === "done"
              ? t("en_wh_passed").replace("{0}", String(Math.round(c.wh_avg || 0)))
              : ` · ${t("en_wh_qfrac").replace("{0}", String(c.q_filled || 0)).replace("{1}", String(c.q_goal || 20))}`;
          const stars = c.wh_stars || 0;
          return (
            <li key={c.id} className="en-wh-row">
              <button type="button" className="en-wh-row-main" onClick={() => openCard(c)}>
                <strong>{c.translation || c.word}</strong>
                <span className="muted">
                  {meta}
                  {qmeta}
                </span>
              </button>
              <div className="en-wh-row-act">
                <span className={stars ? "en-wh-stars-sm" : "muted"}>{stars ? starsGlyph(stars) : t("en_wh_not_done")}</span>
                {bin === "away" || bin === "done" || c.wh_state === "away" ? (
                  <button type="button" className="hud-btn" onClick={() => void move(c.id, "shelf")}>
                    {t("en_wh_to_shelf")}
                  </button>
                ) : (
                  <button type="button" className="hud-btn" onClick={() => void move(c.id, "away")}>
                    {t("en_wh_to_work")}
                  </button>
                )}
                <button type="button" className="hud-btn amber" onClick={() => openCard(c)}>
                  {t("en_wh_open")}
                </button>
              </div>
            </li>
          );
        })}
        {!cards.length && (
          <li className="en-wh-empty muted">
            {emptyText()}{" "}
            {onOpenScanner && (
              <button type="button" className="hud-btn" onClick={onOpenScanner}>
                {t("en_open_scanner")}
              </button>
            )}
          </li>
        )}
      </ul>
      {!!cards.length && (
        <div className="bridge-actions">
          <button type="button" className="hud-btn" onClick={shuffle}>
            {t("en_wh_shuffle")}
          </button>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
