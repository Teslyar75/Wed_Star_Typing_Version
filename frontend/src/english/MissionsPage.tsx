/** МИССИИ EN — хаб как tab_04 + полёт/телеметрия как tab_04b. */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import MicTransmit from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import type { MissionTask } from "./types";

type Props = {
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  defaultLen?: number;
  defaultSet?: string;
  defaultMode?: "random" | "speaking" | "reading" | "questions";
  defaultSource?: string;
  listId?: number;
  single?: string;
  autoStart?: boolean;
  asr?: boolean;
  onOpenWord?: (word: string) => void;
  onExitHub?: () => void;
};

const MODES = [
  { id: "random", code: "M-RND", titleKey: "en_m_rnd", blurbKey: "en_m_rnd_blurb" },
  { id: "speaking", code: "M-SPK", titleKey: "en_m_spk", blurbKey: "en_m_spk_blurb" },
  { id: "reading", code: "M-RDG", titleKey: "en_m_rdg", blurbKey: "en_m_rdg_blurb" },
  { id: "questions", code: "M-QST", titleKey: "en_m_qst", blurbKey: "en_m_qst_blurb" },
] as const;

const SRC_BTNS = [
  { id: "set", lab: "en_src_current" },
  { id: "due", lab: "en_src_review_btn" },
  { id: "mistakes", lab: "en_src_err7" },
  { id: "list", lab: "en_src_list" },
] as const;

export default function MissionsPage({
  onDuck,
  ttsRate = 1,
  defaultLen = 10,
  defaultSet = "top-3000",
  defaultMode = "random",
  defaultSource = "set",
  listId,
  single,
  autoStart = false,
  asr = true,
  onOpenWord,
  onExitHub,
}: Props) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>(defaultMode);
  const [source, setSource] = useState(defaultSource);
  const [len, setLen] = useState(defaultLen);
  const [tasks, setTasks] = useState<MissionTask[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ok, setOk] = useState(0);
  const [fail, setFail] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [secs, setSecs] = useState(0);
  const autoRef = useRef(false);

  useEffect(() => {
    if (!tasks.length || done) return;
    setSecs(0);
    const id = window.setInterval(() => setSecs((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [tasks.length, done]);

  const start = async (override?: { mode?: typeof mode; source?: string }) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/english/missions/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: override?.mode || mode,
          set_id: defaultSet,
          length: len,
          source: override?.source || source,
          list_id: listId,
          single,
          speech_ok: asr,
        }),
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const j = (await r.json()) as { tasks: MissionTask[]; title: string };
      setTasks(j.tasks || []);
      setI(0);
      setOk(0);
      setFail(0);
      setDone(false);
      setPicked(null);
      setSecs(0);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoStart || autoRef.current) return;
    autoRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot launch from hub
  }, [autoStart]);

  const task = tasks[i];
  const advance = (pass: boolean) => {
    if (pass) setOk((x) => x + 1);
    else setFail((x) => x + 1);
    setPicked(null);
    if (i + 1 >= tasks.length) setDone(true);
    else setI((x) => x + 1);
  };

  const exitFlight = () => {
    setTasks([]);
    setDone(false);
    autoRef.current = false;
    onExitHub?.();
  };

  const stars = () => {
    const total = ok + fail;
    if (!total) return 0;
    const acc = ok / total;
    if (acc >= 0.95) return 3;
    if (acc >= 0.8) return 2;
    if (acc >= 0.6) return 1;
    return 0;
  };

  const elapsed = () => {
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  if (done) {
    const s = stars();
    const seen = [...new Map(tasks.map((x) => [x.word, x])).values()];
    return (
      <div className="en-mission-debrief inst-panel">
        <h3>{t("en_mission_done")}</h3>
        <p className="en-stars">{"★".repeat(s)}{"☆".repeat(3 - s)}</p>
        <p>
          {t("en_mission_stats")
            .replace("{0}", String(ok))
            .replace("{1}", String(fail))
            .replace("{2}", String(Math.round((100 * ok) / Math.max(1, ok + fail))))}
        </p>
        <div className="en-debrief-words">
          {seen.map((w) => (
            <button key={w.word_id} type="button" className="linkish" onClick={() => onOpenWord?.(w.word)}>
              {w.word}
            </button>
          ))}
        </div>
        <div className="bridge-actions">
          <button type="button" className="hud-btn amber" onClick={() => void start()}>
            {t("en_mission_retry")}
          </button>
          <button type="button" className="hud-btn" onClick={() => void start({ source: "mistakes" })}>
            {t("en_repeat_mistakes_mission")}
          </button>
          <button type="button" className="hud-btn" onClick={exitFlight}>
            {t("en_mission_again")}
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <section className="en-missions">
        <header className="missions-map-head">
          <h2 className="route-title">{t("en_missions")}</h2>
          <p className="muted">{t("en_missions_blurb")}</p>
        </header>

        <div className="inst-panel en-flight-plan">
          <div className="lab">{t("en_flight_plan")}</div>
          <div className="en-filter-row">
            <span className="lab">{t("en_source")}</span>
            {SRC_BTNS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`hud-btn en-chip ${source === s.id ? "amber" : ""}`}
                onClick={() => setSource(s.id)}
              >
                {t(s.lab)}
              </button>
            ))}
          </div>
          <div className="en-filter-row">
            <span className="lab">{t("en_length")}</span>
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                type="button"
                className={`hud-btn en-chip ${len === n ? "amber" : ""}`}
                onClick={() => setLen(n)}
              >
                {n}
              </button>
            ))}
            <span className="muted mono">
              {t("en_scan_meta").replace("{0}", defaultSet).replace("{1}", String(len))}
            </span>
          </div>
        </div>

        <div className="en-mission-modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`en-mode-card ${mode === m.id ? "on" : ""}`}
              onClick={() => {
                setMode(m.id);
                void start({ mode: m.id });
              }}
              disabled={busy}
            >
              <strong>{m.code}</strong>
              <span className="en-mode-title">{t(m.titleKey)}</span>
              <span className="muted en-mode-blurb">{t(m.blurbKey)}</span>
              <span className="en-mode-stars" aria-hidden>
                ☆☆☆
              </span>
            </button>
          ))}
        </div>
        {msg && <p className="muted">{msg}</p>}
      </section>
    );
  }

  const speaking = task.type.startsWith("S");
  const expected =
    task.type === "S1"
      ? task.word
      : task.type === "S3"
        ? task.sentence?.en || task.word
        : task.sentence?.en || task.word;
  const acc = Math.round((100 * ok) / Math.max(1, ok + fail));

  return (
    <section className="en-mission-flight">
      <div className="en-flight-layout">
        <div className="en-flight-main inst-panel">
          <div className="en-flight-head">
            <div className="lab">
              {task.title} · {i + 1}/{tasks.length}
            </div>
            <div className="en-route-bar">
              <span className="lab">{t("en_route_progress")}</span>
              <div className="en-lvl-bar">
                <div style={{ width: `${((i + 1) / Math.max(1, tasks.length)) * 100}%` }} />
              </div>
              <span className="mono muted">
                {i + 1} / {tasks.length}
              </span>
            </div>
          </div>
          <h2 className="en-mission-prompt">
            {task.type === "R1" ? task.cloze : task.type === "Q1" ? task.prompt || task.definition : task.word}
          </h2>
          {task.sentence?.en && task.type !== "R1" && <p className="muted">{task.sentence.en}</p>}
          {task.sentence?.ru && task.type === "S3" && <p className="en-ru">{task.sentence.ru}</p>}
          {task.options && (
            <div className="en-opts">
              {task.options.map((opt, idx) => (
                <button
                  key={opt + idx}
                  type="button"
                  className={`hud-btn en-opt-btn ${picked === idx ? (idx === task.answer ? "ok" : "danger") : ""}`}
                  onClick={() => {
                    setPicked(idx);
                    setTimeout(() => advance(idx === task.answer), 400);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {speaking && (
            <div className="en-flight-speak">
              <SpeakButton text={expected} rate={ttsRate} onDuck={onDuck} label={t("en_sample")} />
              <MicTransmit
                expected={expected}
                targetWord={task.word}
                enabled={asr}
                onDuck={onDuck}
                onResult={(sc) => {
                  if (sc >= 60) advance(sc >= 60);
                }}
              />
            </div>
          )}
          {task.type === "Q4" && (
            <button type="button" className="hud-btn amber" onClick={() => advance(true)}>
              {task.word} — {t("en_pass")}
            </button>
          )}
          <footer className="en-flight-foot">
            <button type="button" className="hud-btn danger" onClick={exitFlight}>
              {t("en_exit_esc")}
            </button>
            <button type="button" className="hud-btn" onClick={() => advance(false)}>
              {t("en_skip")}
            </button>
            <button
              type="button"
              className="hud-btn amber"
              disabled={picked == null && !!task.options}
              onClick={() => advance(true)}
            >
              {t("en_next_enter")}
            </button>
          </footer>
        </div>

        <aside className="inst-panel en-telem">
          <div className="lab">{t("en_telemetry")}</div>
          <div className="en-telem-gauge">
            <strong className="mono">{acc || 0}%</strong>
            <span className="muted">{t("en_accuracy")}</span>
          </div>
          <dl className="en-telem-stats">
            <div>
              <dt>{t("en_time")}</dt>
              <dd className="mono">{elapsed()}</dd>
            </div>
            <div>
              <dt>{t("en_errors")}</dt>
              <dd className="mono">{fail}</dd>
            </div>
            <div>
              <dt>{t("en_streak")}</dt>
              <dd className="mono">
                {ok} / {ok + fail}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
