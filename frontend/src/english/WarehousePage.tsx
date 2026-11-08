/** СКЛАД КАРТОЧЕК — RU → EN вслух (WAREHOUSE_CARDS.md). */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import MicTransmit from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import { verdict } from "./textutil";
import type { EnWord } from "./types";

/** Константы warehouse.py десктопа. */
export const FLIP_OK = 80;
export const PASS_QUALITY = 85;
export const MAX_DIFF = 3;
export const PASS_CHOICES = [1, 2, 3, 5] as const;
export const WORD_KEY = -1;

type Tone = "" | "green" | "amber" | "red" | "cyan";
type AttemptOut = {
  score: number;
  ok: boolean;
  need: number;
  xp: number;
  next_key: number;
  scores: Record<string, number>;
  runs: number;
  goal: number;
  result?: { status: string; avg?: number; stars?: number; done?: number; goal?: number };
};

const stars = (n: number) => {
  const k = Math.max(0, Math.min(3, n));
  return "★".repeat(k) + "☆".repeat(3 - k);
};

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
  /** удерживаемая подсказка: ключ строки или null (как self._holding на десктопе) */
  const [holding, setHolding] = useState<number | null>(null);
  const [active, setActive] = useState<number>(WORD_KEY);
  const [sel, setSel] = useState<boolean[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [goal, setGoal] = useState(defaultGoal);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<Tone>("");
  const [fb, setFb] = useState<{ text: string; tone: Tone } | null>(null);
  const holdingRef = useRef<number | null>(null);
  holdingRef.current = holding;

  const reload = useCallback(async () => {
    const r = await fetch(`/api/english/warehouse/cards?state=${state}`, { credentials: "include" });
    const rows = (await r.json()) as EnWord[];
    setCards(Array.isArray(rows) ? rows : []);
    setOpen(null);
  }, [state]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sentsOf = (c: EnWord) => (c.sentences || []).slice(0, MAX_DIFF);

  const openCard = (c: EnWord) => {
    const n = sentsOf(c).length;
    const sv = c.wh_sel && c.wh_sel.length === n ? c.wh_sel : Array.from({ length: n }, () => true);
    const cur: Record<number, number> = {};
    for (const [k, v] of Object.entries(c.wh_current || {})) cur[Number(k)] = Number(v) || 0;
    setSel(sv);
    setScores(cur);
    setActive(WORD_KEY);
    setHolding(null);
    setFb(null);
    setGoal(c.wh_goal || defaultGoal);
    setOpen(c);
  };

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const move = async (wordId: number, st: State) => {
    await post("/api/english/warehouse/move", { word_id: wordId, state: st });
    void reload();
  };

  const expectedFor = (key: number): string => {
    if (!open) return "";
    if (key === WORD_KEY) return open.word;
    return sentsOf(open)[key]?.en || open.word;
  };

  const toggleSel = async (idx: number, on: boolean) => {
    if (!open) return;
    const next = [...sel];
    next[idx] = on;
    if (!next.some(Boolean)) return; // хотя бы одно предложение остаётся отмеченным
    setSel(next);
    const j = (await post("/api/english/warehouse/select", { word_id: open.id, sel: next })) as { sel?: boolean[] };
    if (j.sel) setSel(j.sel);
  };

  const changeGoal = async (n: number) => {
    if (!open) return;
    setGoal(n);
    await post("/api/english/warehouse/goal", { word_id: open.id, goal: n });
  };

  /** Порт pages_warehouse.on_speech: балл считает программа, ≥80% — задание закрыто. */
  const onSpeech = async (sc: number, alts: string[]) => {
    if (!open || holdingRef.current !== null) return; // во время подсказки речь не засчитывается
    if (!alts.length) return;
    const key = active;
    const j = (await post("/api/english/warehouse/attempt", { word_id: open.id, key, score: sc })) as AttemptOut;
    const v = verdict(j.score);
    setScores(Object.fromEntries(Object.entries(j.scores || {}).map(([k, x]) => [Number(k), Number(x)])));
    if (!j.ok) {
      setFb({ text: `Совпадение ${j.score}% · нужно ≥ ${j.need}%`, tone: v.tone });
      return;
    }
    setFb(null);
    const xp = j.xp ? `  +${j.xp} XP` : "";
    const res = j.result || { status: "incomplete" };
    setActive(j.next_key);
    if (res.status === "weak") {
      setMsg(`Прогон слабый (ср. ${res.avg}%) — нужно ≥ ${PASS_QUALITY}%. Повтори все задания.`);
      setMsgTone("amber");
    } else if (res.status === "pass") {
      setMsg(`Прогон ${res.done}/${res.goal} засчитан · ${stars(res.stars || 0)} · ср. ${res.avg}%${xp}`);
      setMsgTone("cyan");
      setOpen({ ...open, wh_runs: j.runs, wh_goal: j.goal });
    } else if (res.status === "cleared") {
      setMsg(`Все прогоны готовы → ОТРАБОТАНО · ${stars(res.stars || 0)} · ср. ${res.avg}%${xp}`);
      setMsgTone("green");
      setState("done");
      void reload();
    } else {
      setMsg(key === WORD_KEY ? `Слово: ${j.score}% · ${v.text}${xp}` : `Предложение ${key + 1}: ${j.score}% · ${v.text}${xp}`);
      setMsgTone("green");
    }
  };

  if (open) {
    const sents = sentsOf(open);
    const line = (key: number, ru: string, en: string) => {
      const sc = scores[key];
      const done = (sc ?? 0) >= FLIP_OK;
      return (
        <div className="en-wh-line-wrap">
          <button
            type="button"
            className={`en-wh-line ${active === key ? "on" : ""}${done ? " ok" : ""}`}
            onClick={() => setActive(key)}
          >
            <strong>{holding === key ? en : ru || "—"}</strong>
            {sc != null && sc > 0 && (
              <span className={`en-wh-score tone-${verdict(sc).tone}`}>
                {done ? "✓ " : ""}
                {sc}%
              </span>
            )}
          </button>
          <button
            type="button"
            className="hud-btn en-wh-hint"
            title={t("en_hint_hold")}
            onPointerDown={() => setHolding(key)}
            onPointerUp={() => setHolding(null)}
            onPointerLeave={() => setHolding((h) => (h === key ? null : h))}
            onPointerCancel={() => setHolding(null)}
          >
            {t("en_hint_hold")}
          </button>
        </div>
      );
    };
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
            <select value={goal} onChange={(e) => void changeGoal(Number(e.target.value))}>
              {PASS_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted en-wh-rule">
          Прогон: слово и отмеченные предложения ≥ {FLIP_OK}% · средняя ≥ {PASS_QUALITY}%
        </p>
        <div className="inst-panel en-wh-face">
          {line(WORD_KEY, open.translation || open.my_tr || "", open.word)}
          {sents.map((s, idx) => (
            <div key={idx} className="en-wh-sent-row">
              <input
                type="checkbox"
                checked={sel[idx] ?? false}
                onChange={(e) => void toggleSel(idx, e.target.checked)}
              />
              {line(idx, s.ru || s.en, s.en)}
            </div>
          ))}
        </div>
        <div className="bridge-actions">
          <SpeakButton text={expectedFor(active)} rate={ttsRate} onDuck={onDuck} label={t("en_speak_en")} />
        </div>
        <MicTransmit
          key={`${open.id}:${active}`}
          expected={expectedFor(active)}
          targetWord={open.word}
          mode={active === WORD_KEY ? "word" : "sentence"}
          wordId={open.id}
          soundsLike={open.sounds_like}
          enabled={holding === null && (active === WORD_KEY || !!sel[active])}
          onDuck={onDuck}
          onResult={(sc, _tr, alts) => void onSpeech(sc, alts)}
        />
        {fb && <p className={`en-wh-fb tone-${fb.tone}`}>{fb.text}</p>}
        {msg && <p className={`muted tone-${msgTone}`}>{msg}</p>}
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
