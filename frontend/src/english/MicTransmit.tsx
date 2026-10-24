/**
 * Порт stamina/english/mic.py MicPanel:
 *  — ПЕРЕДАЧА / СЛУШАЮ (+ СТОП) / РАСПОЗНАЮ;
 *  — LevelMeter 20 сегментов;
 *  — мин. 2 с, потом стоп по паузе или кнопкой СТОП;
 *  — распознавание: серверный Vosk (Python) → если недоступен, Vosk/Web Speech в браузере;
 *  — оценка только автоматическая (сравнение распознанного с текстом), без самооценки.
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import MatchReadout from "./MatchReadout";
import { asrAvailable, listenOnce } from "./asr";
import { listenOnceServer, serverAsrAvailable } from "./serverAsr";
import { scoreSentence, scoreWord } from "./textutil";

type Engine = "server" | "browser" | "none" | "checking";

export type MatchInfo = {
  score: number | null;
  heard: string;
  selfScore: boolean;
  missed: string[];
  counted?: number;
  total?: number;
  listening?: boolean;
  error?: string;
};

type Props = {
  expected: string;
  targetWord?: string;
  enabled?: boolean;
  /** "word" — оценка слова (score_word + sounds_like), "sentence" — score_sentence */
  mode?: "sentence" | "word";
  wordId?: number;
  soundsLike?: string[];
  hideMatch?: boolean;
  onDuck?: (on: boolean) => void;
  onResult?: (score: number, transcript: string, alternatives: string[]) => void;
  onMatch?: (info: MatchInfo) => void;
  onListening?: (on: boolean) => void;
};

const SEG = 20;

function rmsToFrac(rms: number): number {
  if (rms <= 0.002) return 0;
  const v = (Math.log10(rms) + 2.7) / 2.2;
  return Math.min(1, Math.max(0, v));
}

function LevelMeter({ frac, live }: { frac: number; live: boolean }) {
  const filled = live ? Math.max(frac > 0.02 ? Math.round(frac * SEG) : 2, Math.round(frac * SEG)) : 0;
  return (
    <div className={`en-level-meter${live ? " on" : ""}`} aria-hidden title={t("en_mic_level")}>
      {Array.from({ length: SEG }, (_, i) => {
        const t01 = i / (SEG - 1);
        const tone = t01 < 0.6 ? "ok" : t01 < 0.85 ? "amber" : "danger";
        return <span key={i} className={`seg ${tone}${i < filled ? " on" : ""}`} />;
      })}
    </div>
  );
}

export default function MicTransmit({
  expected,
  targetWord,
  enabled = true,
  mode = "sentence",
  wordId,
  soundsLike,
  hideMatch = false,
  onDuck,
  onResult,
  onMatch,
  onListening,
}: Props) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [levelFrac, setLevelFrac] = useState(0);
  const [ledHot, setLedHot] = useState(false);
  const [heard, setHeard] = useState("");
  const [liveHint, setLiveHint] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [selfScore, setSelfScore] = useState(false);
  const [missed, setMissed] = useState<string[]>([]);
  const [counted, setCounted] = useState<number | undefined>();
  const [total, setTotal] = useState<number | undefined>();
  const [err, setErr] = useState("");
  const [engine, setEngine] = useState<Engine>("checking");
  const asrOk = engine === "server" || engine === "browser";
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      const a = await serverAsrAvailable();
      if (dead) return;
      if (a.ok) {
        setEngine("server");
        return;
      }
      const b = await asrAvailable().catch(() => ({ ok: false }));
      if (!dead) setEngine(b.ok ? "browser" : "none");
    })();
    return () => {
      dead = true;
      stopRef.current?.();
    };
  }, []);

  const publish = (info: MatchInfo) => {
    setScore(info.score);
    setHeard(info.heard);
    setSelfScore(info.selfScore);
    setMissed(info.missed);
    setCounted(info.counted);
    setTotal(info.total);
    if (info.error != null) setErr(info.error);
    onMatch?.(info);
  };

  const stopMic = () => {
    stopRef.current?.();
    setLiveHint(t("en_scoring"));
  };

  const listen = async () => {
    if (!expected.trim() || !enabled || listening || processing) return;
    setListening(true);
    setProcessing(false);
    setLedHot(true);
    setLevelFrac(0.08);
    setScore(null);
    setSelfScore(false);
    setMissed([]);
    setCounted(undefined);
    setTotal(undefined);
    setHeard("");
    setErr("");
    setLiveHint(t("en_mic_speak_hint"));
    onListening?.(true);
    publish({ score: null, heard: "", selfScore: false, missed: [], listening: true });
    onDuck?.(true);

    try {
      const opts = {
        expected,
        targetWord,
        maxMs: 15000,
        waitStartMs: 2000,
        silenceMs: 1200,
        onReadyStop: (stop: () => void) => {
          stopRef.current = stop;
        },
        onStarted: () => {
          setLiveHint(t("en_mic_speak_hint"));
          setLedHot(true);
        },
        onProcessing: () => {
          setListening(false);
          setProcessing(true);
          setLedHot(false);
          setLevelFrac(0);
          setLiveHint(t("en_scoring"));
          stopRef.current = null;
        },
        onInterim: (text: string) => {
          setHeard(text);
          setLiveHint(`«${text}»`);
          setLedHot(true);
          onMatch?.({
            score: null,
            heard: text,
            selfScore: false,
            missed: [],
            listening: true,
          });
        },
        onLevel: (rms: number) => {
          setLevelFrac((prev) => Math.max(rmsToFrac(rms), prev * 0.55));
          if (rms >= 0.004) setLedHot(true);
        },
        onSounding: (on: boolean) => {
          if (on) setLedHot(true);
        },
      };
      let res: { transcript: string; alternatives: string[]; score: number; marks: [string, boolean][]; error?: string };
      if (engine === "server") {
        res = await listenOnceServer({ ...opts, mode, wordId });
      } else {
        // браузерный движок → та же автоматическая оценка, что на десктопе
        const r = await listenOnce(opts);
        const alts = (r.alternatives?.length ? r.alternatives : [r.transcript]).filter((a) => a && a.trim());
        if (mode === "word") {
          res = { ...r, alternatives: alts, score: alts.length ? scoreWord(expected, alts, soundsLike) : 0, marks: [] };
        } else {
          let best = { score: -1, marks: [] as [string, boolean][], heard: "" };
          for (const a of alts) {
            const sc = scoreSentence(expected, a, targetWord);
            if (sc.score > best.score) best = { ...sc, heard: a };
          }
          res = { ...r, alternatives: alts, transcript: best.heard || r.transcript, score: Math.max(0, best.score), marks: best.marks };
        }
      }

      setListening(false);
      setLedHot(false);
      setLevelFrac(0);
      onListening?.(false);
      stopRef.current = null;

      if (res.error === "mic-denied" || res.error === "not-allowed") {
        setErr(t("en_mic_denied"));
        setLiveHint("");
        publish({ score: null, heard: "", selfScore: false, missed: [], error: res.error });
        return;
      }

      if (res.error === "no-asr") {
        setEngine("none");
        setErr(t("en_mic_no_asr"));
        setLiveHint("");
        publish({ score: null, heard: "", selfScore: false, missed: [], error: "no-asr" });
        return;
      }

      const empty = !res.transcript.trim();
      if (empty) {
        const msg =
          res.error === "silent"
            ? t("en_mic_silent")
            : res.error === "no-words"
              ? t("en_mic_no_words")
              : t("en_mic_heard_nothing");
        setErr(msg);
        setLiveHint(msg);
        publish({
          score: 0,
          heard: "",
          selfScore: false,
          missed: [],
          counted: 0,
          total: undefined,
          listening: false,
          error: res.error || "empty",
        });
        onResult?.(0, "", []);
        return;
      }

      setErr("");
      setLiveHint(`${t("en_heard")}: «${res.transcript}» · ${Math.round(res.score)}%`);
      const marks = res.marks || [];
      publish({
        score: res.score,
        heard: res.transcript,
        selfScore: false,
        missed: marks.filter(([, ok]) => !ok).map(([w]) => w),
        counted: marks.filter(([, ok]) => ok).length,
        total: marks.length,
        listening: false,
      });
      onResult?.(res.score, res.transcript, res.alternatives || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "asr-error");
      setLiveHint("");
      publish({ score: 0, heard: "", selfScore: false, missed: [], error: "asr-error" });
    } finally {
      setListening(false);
      setProcessing(false);
      setLedHot(false);
      setLevelFrac(0);
      stopRef.current = null;
      onListening?.(false);
      onDuck?.(false);
    }
  };


  return (
    <div className="en-mic-block">
      {asrOk ? (
        <>
          <div className="en-mic-row">
            <span
              className={`en-mic-led${ledHot || listening ? " hot" : ""}`}
              title={listening || ledHot ? t("en_mic_receiving") : t("en_mic_level")}
              aria-label={listening ? t("en_listening") : t("en_mic_level")}
            />
            {!listening ? (
              <button
                type="button"
                className={`hud-btn ${processing ? "danger" : "amber"}`}
                onClick={() => void listen()}
                disabled={!enabled || processing}
              >
                {processing ? t("en_scoring") : t("en_transmit")}
              </button>
            ) : (
              <>
                <button type="button" className="hud-btn danger" disabled>
                  {t("en_listening")}
                </button>
                <button type="button" className="hud-btn" onClick={stopMic} title={t("en_mic_stop")}>
                  {t("en_mic_stop")}
                </button>
              </>
            )}
          </div>
          <LevelMeter frac={listening ? Math.max(levelFrac, 0.08) : 0} live={listening} />
          {liveHint ? <p className="muted en-mic-live">{liveHint}</p> : null}
        </>
      ) : (
        <p className="muted en-mic-err" data-testid="mic-no-asr">
          {engine === "checking" ? t("en_scoring") : t("en_mic_no_asr")}
        </p>
      )}
      {err && asrOk ? <p className="muted en-mic-err">{err}</p> : null}
      {!hideMatch && !listening && !processing && score != null && (
        <MatchReadout
          score={score}
          heard={heard}
          selfScore={selfScore}
          missed={missed}
          counted={counted}
          total={total}
        />
      )}
    </div>
  );
}
