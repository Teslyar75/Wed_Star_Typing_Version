/**
 * E-TAC Вспышка — паритет FlashEx + панель усложнения (слова 1…10, время мс).
 * Рамка вспышки и поле ввода растут вместе с числом слов.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang, t } from "../i18n";
import {
  clampTacMs,
  clampTacWords,
  flashPool,
  flashScore,
  flashStars,
  flattenTyped,
  formatFlashLines,
  formatInputWrap,
  isBetterFlash,
  loadTacCfg,
  pickFlashAnswer,
  roundPoints,
  saveTacCfg,
  TAC_MAX_MS,
  TAC_MAX_WORDS,
  TAC_MIN_MS,
  TAC_PRE_MS,
  TAC_ROUNDS,
  tacFrameGeom,
} from "./flashEx";
import { saveExBest } from "./tableEx";
import "./exShell.css";
import "./exTrainers.css";

export type FlashResult = {
  mode: "tachi";
  wpm: number;
  words: number;
  elapsed: number;
  score: number;
};

type Props = {
  bookText?: string;
  onExit: () => void;
  onResult: (payload: FlashResult) => void;
};

type Phase = "wait" | "show" | "mask" | "done";

export default function FlashExView({ bookText = "", onExit, onResult }: Props) {
  const cfg0 = loadTacCfg();
  const [pool] = useState(() => flashPool(bookText, getLang()));
  const [cfgWords, setCfgWords] = useState(cfg0.words);
  const [cfgMs, setCfgMs] = useState(cfg0.ms);
  const [autoLadder, setAutoLadder] = useState(false);
  const [round, setRound] = useState(0);
  const [ms, setMs] = useState(cfg0.ms);
  const [nwords, setNwords] = useState(cfg0.words);
  const [streak, setStreak] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("wait");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(null);
  const [bestNw, setBestNw] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [lastGain, setLastGain] = useState(0);

  const inpRef = useRef<HTMLTextAreaElement>(null);
  const jobRef = useRef<number | null>(null);
  const stateRef = useRef({
    round: 0,
    ms: cfg0.ms,
    nwords: cfg0.words,
    streak: 0,
    ok: 0,
    points: 0,
    bestMs: null as number | null,
    bestNw: null as number | null,
    answer: "",
    phase: "wait" as Phase,
    auto: false,
  });

  const clearJob = () => {
    if (jobRef.current != null) {
      window.clearTimeout(jobRef.current);
      jobRef.current = null;
    }
  };

  const sync = () => {
    const s = stateRef.current;
    setRound(s.round);
    setMs(s.ms);
    setNwords(s.nwords);
    setStreak(s.streak);
    setOkCount(s.ok);
    setAnswer(s.answer);
    setPhase(s.phase);
    setBestMs(s.bestMs);
    setBestNw(s.bestNw);
    setPoints(s.points);
  };

  const finish = useCallback(() => {
    clearJob();
    const s = stateRef.current;
    s.phase = "done";
    sync();
    if (s.ok === 0 || s.points <= 0) {
      setStatus(t("ex_tac_none"));
      setStatusOk(null);
      return;
    }
    const score = flashScore(s.bestNw ?? s.nwords, s.bestMs ?? s.ms, s.points);
    const stars = flashStars(s.bestNw ?? 0, s.bestMs ?? 999, s.points, s.ok);
    const isRecord = saveExBest("E-TAC", "default", score, false);
    const starsStr = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
    setStatus(
      t("ex_tac_finish")
        .replace("{0}", String(s.bestNw ?? s.nwords))
        .replace("{1}", String(s.bestMs ?? s.ms))
        .replace("{2}", String(s.ok))
        .replace("{3}", String(TAC_ROUNDS))
        .replace("{4}", starsStr)
        .replace("{5}", String(s.points)) + (isRecord ? `  ${t("ex_new_record")}` : ""),
    );
    setStatusOk(null);
    onResult({
      mode: "tachi",
      wpm: 0,
      words: s.ok,
      elapsed: 0,
      score,
    });
  }, [onResult]);

  const nextRound = useCallback(() => {
    clearJob();
    const s = stateRef.current;
    s.round += 1;
    if (s.round > TAC_ROUNDS) {
      finish();
      return;
    }
    s.answer = pickFlashAnswer(pool, s.nwords);
    s.phase = "wait";
    setInput("");
    sync();
    jobRef.current = window.setTimeout(() => {
      s.phase = "show";
      sync();
      jobRef.current = window.setTimeout(() => {
        s.phase = "mask";
        sync();
        jobRef.current = null;
        inpRef.current?.focus();
      }, s.ms);
    }, TAC_PRE_MS);
  }, [finish, pool]);

  const startSession = useCallback(
    (words: number, showMs: number, auto: boolean) => {
      clearJob();
      const w = clampTacWords(words);
      const m = clampTacMs(showMs);
      stateRef.current = {
        round: 0,
        ms: m,
        nwords: w,
        streak: 0,
        ok: 0,
        points: 0,
        bestMs: null,
        bestNw: null,
        answer: "",
        phase: "wait",
        auto,
      };
      setCfgWords(w);
      setCfgMs(m);
      setAutoLadder(auto);
      setStatus("");
      setStatusOk(null);
      setInput("");
      setLastGain(0);
      sync();
      nextRound();
    },
    [nextRound],
  );

  const renew = useCallback(() => {
    startSession(cfgWords, cfgMs, autoLadder);
  }, [startSession, cfgWords, cfgMs, autoLadder]);

  const applyWords = (raw: number) => {
    const w = clampTacWords(raw);
    setCfgWords(w);
    saveTacCfg(w, cfgMs);
    stateRef.current.nwords = w;
    setNwords(w);
    /* сбросить автолестницу по словам — юзер задал уровень вручную */
    stateRef.current.auto = false;
    setAutoLadder(false);
  };

  const applyMs = (raw: number) => {
    const m = clampTacMs(raw);
    setCfgMs(m);
    saveTacCfg(cfgWords, m);
    stateRef.current.ms = m;
    setMs(m);
    stateRef.current.auto = false;
    setAutoLadder(false);
  };

  const check = useCallback(() => {
    const s = stateRef.current;
    if (jobRef.current != null || s.phase === "done" || s.round > TAC_ROUNDS) return;
    if (s.phase !== "mask") return;
    const got = flattenTyped(input);
    const ok = got === flattenTyped(s.answer);
    if (ok) {
      s.ok += 1;
      const gain = roundPoints(s.answer, s.nwords, s.ms);
      s.points += gain;
      setLastGain(gain);
      if (isBetterFlash(s.nwords, s.ms, s.bestNw, s.bestMs)) {
        s.bestMs = s.ms;
        s.bestNw = s.nwords;
      }
      if (s.auto) {
        /* лестница только в авторежиме */
        let nextStreak = s.streak + 1;
        if (nextStreak >= 3) {
          nextStreak = 0;
          if (s.ms > 60) s.ms = Math.max(TAC_MIN_MS, s.ms - 20);
          else if (s.nwords < TAC_MAX_WORDS) {
            s.nwords += 1;
            s.ms = 200;
          }
        }
        s.streak = nextStreak;
        setCfgWords(s.nwords);
        setCfgMs(s.ms);
        saveTacCfg(s.nwords, s.ms);
      } else {
        s.streak += 1;
      }
      setStatus(
        `${t("ex_tac_ok").replace("{0}", s.answer)}  ${t("ex_tac_gain").replace("{0}", String(gain))}`,
      );
      setStatusOk(true);
    } else {
      s.streak = 0;
      setLastGain(0);
      if (s.auto) {
        s.ms = Math.min(TAC_MAX_MS, s.ms + 20);
        setCfgMs(s.ms);
        saveTacCfg(s.nwords, s.ms);
      }
      setStatus(t("ex_tac_bad").replace("{0}", s.answer));
      setStatusOk(false);
    }
    sync();
    nextRound();
  }, [input, nextRound]);

  useEffect(() => {
    startSession(cfg0.words, cfg0.ms, false);
    return () => clearJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearJob();
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  void streak;
  void okCount;

  const display =
    phase === "show"
      ? formatFlashLines(answer, false)
      : phase === "mask"
        ? formatFlashLines(answer, true)
        : "";

  const geom = tacFrameGeom(nwords);
  const frameStyle = {
    width: `min(${geom.widthCh}ch, 92%)`,
    minHeight: `${geom.minHeightEm}em`,
  } as const;

  return (
    <div className="ex-shell ex-tac" data-nav-lock>
      <header className="ex-head">
        <span className="ex-head-bar" aria-hidden />
        <div className="ex-head-text">
          <h2 className="ex-title">{t("ex_title_tac")}</h2>
          <p className="ex-sub">{t("ex_tac_hint")}</p>
        </div>
        <button type="button" className="hud-btn ex-back-btn" onClick={onExit}>
          {t("ex_back")}
        </button>
      </header>

      <div className="ex-tac-layout">
        <aside className="ex-tac-diff inst-panel">
          <div className="lab">{t("ex_tac_diff")}</div>

          <label className="ex-tac-slider">
            <span className="ex-tac-slider-lab">
              {t("ex_tac_words")}
              <strong>{cfgWords}</strong>
            </span>
            <input
              type="range"
              min={1}
              max={TAC_MAX_WORDS}
              step={1}
              value={cfgWords}
              onChange={(e) => applyWords(Number(e.target.value))}
              aria-label={t("ex_tac_words")}
            />
            <span className="ex-tac-slider-ends">
              <span>1</span>
              <span>{TAC_MAX_WORDS}</span>
            </span>
          </label>

          <label className="ex-tac-slider">
            <span className="ex-tac-slider-lab">
              {t("ex_tac_time")}
              <strong>{cfgMs} {t("ex_tac_ms")}</strong>
            </span>
            <input
              type="range"
              min={TAC_MIN_MS}
              max={TAC_MAX_MS}
              step={10}
              value={cfgMs}
              /* ползунок «влево» = короче вспышка (сложнее) — инверсия визуально через CSS direction */
              onChange={(e) => applyMs(Number(e.target.value))}
              aria-label={t("ex_tac_time")}
            />
            <span className="ex-tac-slider-ends">
              <span>{TAC_MIN_MS}</span>
              <span>{TAC_MAX_MS}</span>
            </span>
            <span className="ex-tac-slider-hint">{t("ex_tac_time_hint")}</span>
          </label>

          <button
            type="button"
            className={`hud-btn ex-tac-auto${autoLadder ? " amber" : ""}`}
            onClick={() => {
              const next = !autoLadder;
              setAutoLadder(next);
              stateRef.current.auto = next;
            }}
          >
            {autoLadder ? t("ex_tac_auto_on") : t("ex_tac_auto_off")}
          </button>
          <p className="ex-tac-diff-hint">{t("ex_tac_diff_hint")}</p>
        </aside>

        <div className="ex-tac-body">
          <div className="ex-tac-canvas">
            <p className="ex-tac-meta">
              {t("ex_tac_round")
                .replace("{0}", String(Math.min(round, TAC_ROUNDS)))
                .replace("{1}", String(TAC_ROUNDS))
                .replace("{2}", String(ms))
                .replace("{3}", String(nwords))}
              {" · "}
              {t("ex_tac_points").replace("{0}", String(points))}
              {lastGain > 0 && phase !== "done" ? ` (+${lastGain})` : ""}
            </p>

            <div className="ex-tac-stage">
              <div className="ex-tac-flash-frame" style={frameStyle}>
                <div className="ex-tac-sight" aria-hidden>
                  <span className="ex-tac-corner tl" />
                  <span className="ex-tac-corner tr" />
                  <span className="ex-tac-corner bl" />
                  <span className="ex-tac-corner br" />
                </div>
                {display ? (
                  <div className={`ex-tac-word${phase === "mask" ? " mask" : ""}`}>{display}</div>
                ) : null}
                {/* точка только в ожидании; при вспышке/маске скрыта */}
                {phase === "wait" && <span className="ex-tac-dot" aria-hidden />}
              </div>

              <textarea
                ref={inpRef}
                className="ex-tac-input"
                style={frameStyle}
                rows={geom.rows}
                value={input}
                onChange={(e) => setInput(formatInputWrap(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    check();
                  }
                }}
                spellCheck={false}
                autoComplete="off"
                aria-label={t("ex_tac_check")}
                placeholder={t("ex_tac_input_ph")}
              />
            </div>
          </div>

          <div className="ex-tac-row">
            <button type="button" className="hud-btn ok ex-tac-check" onClick={check}>
              {t("ex_tac_check")}
            </button>
            <button type="button" className="hud-btn amber" onClick={renew}>
              {t("ex_tac_restart")}
            </button>
          </div>
          <p
            className={`ex-tac-status${statusOk === true ? " ok" : ""}${statusOk === false ? " bad" : ""}`}
          >
            {status}
          </p>
          {(bestNw != null || bestMs != null) && phase !== "done" && (
            <p className="ex-tac-best muted">
              {bestNw != null && bestMs != null
                ? t("ex_tac_best").replace("{0}", String(bestNw)).replace("{1}", String(bestMs))
                : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
