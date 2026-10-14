/** СКЛАД КАРТОЧЕК — RU → EN вслух (WAREHOUSE_CARDS.md). */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import MicTransmit from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import type { EnWord } from "./types";

type State = "shelf" | "away" | "done";

type Props = {
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  defaultGoal?: number;
  onOpenScanner?: () => void;
};

export default function WarehousePage({ onDuck, ttsRate = 1, defaultGoal = 2, onOpenScanner }: Props) {
  const [state, setState] = useState<State>("shelf");
  const [cards, setCards] = useState<EnWord[]>([]);
  const [open, setOpen] = useState<EnWord | null>(null);
  const [hint, setHint] = useState(false);
  const [sel, setSel] = useState(0); // 0 = word, 1.. = sentence idx
  const [checked, setChecked] = useState<boolean[]>([true]);
  const [scores, setScores] = useState<number[]>([]);
  const [goal, setGoal] = useState(defaultGoal);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    const r = await fetch(`/api/english/warehouse/cards?state=${state}`, { credentials: "include" });
    const rows = (await r.json()) as EnWord[];
    setCards(Array.isArray(rows) ? rows : []);
    setOpen(null);
  }, [state]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCard = (c: EnWord) => {
    const n = Math.max(1, (c.sentences || []).length);
    setChecked(Array.from({ length: n }, (_, i) => i === 0 || true).map((_, i) => i < Math.min(n, 3)));
    setScores([]);
    setSel(0);
    setHint(false);
    setGoal(c.wh_goal || defaultGoal);
    setOpen(c);
  };

  const move = async (wordId: number, st: State) => {
    await fetch("/api/english/warehouse/move", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: wordId, state: st }),
    });
    void reload();
  };

  const expectedEn = (): string => {
    if (!open) return "";
    if (sel === 0) return open.word;
    const s = open.sentences?.[sel - 1];
    return s?.en || open.word;
  };

  const displayRu = (): string => {
    if (!open) return "";
    if (hint) return expectedEn();
    if (sel === 0) return open.translation || open.my_tr || "—";
    const s = open.sentences?.[sel - 1];
    return s?.ru || s?.en || "—";
  };

  const onScore = async (sc: number) => {
    if (!open) return;
    const next = [...scores];
    next[sel] = sc;
    setScores(next);
    // если слово + отмеченные предложения закрыты ≥80%
    const need = [0, ...checked.map((c, i) => (c ? i + 1 : -1)).filter((x) => x >= 0)];
    const unique = [...new Set(need)];
    const ready = unique.every((idx) => (next[idx] ?? 0) >= 80);
    if (!ready) return;
    const vals = unique.map((idx) => next[idx]!).filter((x) => x >= 80);
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const r = await fetch("/api/english/warehouse/run", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: open.id, avg, goal }),
    });
    const j = (await r.json()) as { accepted?: boolean; done?: boolean; runs?: number; goal?: number; stars?: number };
    if (!j.accepted) {
      setMsg(t("en_wh_fail_avg"));
      setScores([]);
      return;
    }
    setMsg(
      j.done
        ? t("en_wh_done_auto").replace("{0}", "★".repeat(j.stars || 1))
        : t("en_wh_run_ok").replace("{0}", String(j.runs)).replace("{1}", String(j.goal)),
    );
    if (j.done) void reload();
    else {
      setScores([]);
      setOpen({ ...open, wh_runs: j.runs, wh_goal: j.goal, wh_stars: j.stars });
    }
  };

  if (open) {
    const sents = open.sentences || [];
    return (
      <section className="en-wh-card">
        <div className="bridge-actions">
          <button type="button" className="hud-btn" onClick={() => setOpen(null)}>
            ← {t("en_wh_list")}
          </button>
          <span className="muted">
            {t("en_wh_runs")
              .replace("{0}", String(open.wh_runs || 0))
              .replace("{1}", String(goal))}
          </span>
          <label>
            {t("en_wh_goal")}{" "}
            <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inst-panel en-wh-face">
          <button type="button" className={`en-wh-line ${sel === 0 ? "on" : ""}`} onClick={() => setSel(0)}>
            <strong>{displayRu()}</strong>
            {scores[0] != null && <span className="muted">{scores[0]}%</span>}
          </button>
          {sents.map((s, idx) => (
            <div key={idx} className="en-wh-sent-row">
              <input
                type="checkbox"
                checked={checked[idx] ?? false}
                onChange={(e) => {
                  const next = [...checked];
                  next[idx] = e.target.checked;
                  setChecked(next);
                }}
              />
              <button type="button" className={`en-wh-line ${sel === idx + 1 ? "on" : ""}`} onClick={() => setSel(idx + 1)}>
                {hint && sel === idx + 1 ? s.en : s.ru || s.en}
                {scores[idx + 1] != null && <span className="muted">{scores[idx + 1]}%</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="bridge-actions">
          <button
            type="button"
            className="hud-btn"
            onMouseDown={() => setHint(true)}
            onMouseUp={() => setHint(false)}
            onMouseLeave={() => setHint(false)}
            onTouchStart={() => setHint(true)}
            onTouchEnd={() => setHint(false)}
          >
            {t("en_hint_hold")}
          </button>
          <SpeakButton text={expectedEn()} rate={ttsRate} onDuck={onDuck} label={t("en_speak_en")} />
        </div>
        <MicTransmit expected={expectedEn()} targetWord={open.word} onDuck={onDuck} onResult={(sc) => void onScore(sc)} />
        {msg && <p className="muted">{msg}</p>}
      </section>
    );
  }

  return (
    <section className="en-warehouse">
      <div className="bridge-actions">
        {(
          [
            ["shelf", "en_wh_shelf"],
            ["away", "en_wh_away"],
            ["done", "en_wh_done"],
          ] as const
        ).map(([st, key]) => (
          <button key={st} type="button" className={`hud-btn ${state === st ? "amber" : ""}`} onClick={() => setState(st)}>
            {t(key)}
          </button>
        ))}
      </div>
      <ul className="en-wh-list">
        {cards.map((c) => (
          <li key={c.id} className="en-wh-row">
            <div>
              <strong>{c.translation || c.word}</strong>
              <span className="muted">
                {" "}
                · {(c.pos || "").toUpperCase()} · {t("en_wh_runs").replace("{0}", String(c.wh_runs || 0)).replace("{1}", String(c.wh_goal || 2))}
                {c.wh_stars ? ` · ${"★".repeat(c.wh_stars)}` : ""}
              </span>
            </div>
            <div className="bridge-actions">
              {state === "shelf" && (
                <button type="button" className="hud-btn" onClick={() => void move(c.id, "away")}>
                  {t("en_wh_to_work")}
                </button>
              )}
              {state === "away" && (
                <button type="button" className="hud-btn" onClick={() => void move(c.id, "shelf")}>
                  {t("en_wh_to_shelf")}
                </button>
              )}
              {state === "done" && (
                <button type="button" className="hud-btn" onClick={() => void move(c.id, "shelf")}>
                  {t("en_wh_to_shelf")}
                </button>
              )}
              <button type="button" className="hud-btn amber" onClick={() => openCard(c)}>
                {t("en_wh_open")}
              </button>
            </div>
          </li>
        ))}
        {!cards.length && (
          <li className="muted">
            {t("en_wh_empty")}{" "}
            {onOpenScanner && (
              <button type="button" className="hud-btn" onClick={onOpenScanner}>
                {t("en_open_scanner")}
              </button>
            )}
          </li>
        )}
      </ul>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
