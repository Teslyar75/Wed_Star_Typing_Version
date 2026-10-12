import { useEffect, useRef, useState } from "react";
import { msPerWord } from "./timing";
import { t } from "../i18n";
import { makeQuiz, type QuizItem } from "./quiz";
import { buildPyramid } from "./epyr";

type Mode = "rsvp" | "schulte" | "quiz" | "tachi" | "epyr" | "journal";

type JournalRow = { id: number; mode: string; wpm: number; words: number; elapsed: number; score: number };

function orpIndex(word: string) {
  if (word.length <= 1) return 0;
  if (word.length <= 5) return 1;
  if (word.length <= 9) return 2;
  return 3;
}

export default function SpeedReadPanel() {
  const [text, setText] = useState("Star Typing teaches you to read faster and type with rhythm.");
  const [wpm, setWpm] = useState(300);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);
  const [mode, setMode] = useState<Mode>("rsvp");
  const [msg, setMsg] = useState("");
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [schulte, setSchulte] = useState(() =>
    Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5),
  );
  const [nextNum, setNextNum] = useState(1);
  const [flash, setFlash] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [pyrLevel, setPyrLevel] = useState(0);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [filterMode, setFilterMode] = useState("");
  const words = text.split(/\s+/).filter(Boolean);
  const pyramid = buildPyramid(text, 8);
  const raf = useRef(0);
  const last = useRef(0);
  const started = useRef(0);

  const saveResult = async (payload: {
    mode: string;
    wpm: number;
    words: number;
    elapsed: number;
    score: number;
  }) => {
    const r = await fetch("/api/speedread/results", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) setMsg(t("result_saved"));
  };

  const loadJournal = async (m?: string) => {
    const q = m ? `?mode=${encodeURIComponent(m)}` : "";
    const rows = await (await fetch(`/api/speedread/results${q}`, { credentials: "include" })).json();
    setJournal(rows);
  };

  useEffect(() => {
    if (!run || mode !== "rsvp") return;
    const ms = msPerWord(wpm);
    if (!started.current) started.current = performance.now();
    const loop = (t0: number) => {
      if (t0 - last.current >= ms) {
        last.current = t0;
        setI((x) => {
          if (x + 1 >= words.length) {
            setRun(false);
            const elapsed = (performance.now() - started.current) / 1000;
            void saveResult({ mode: "rsvp", wpm, words: words.length, elapsed, score: wpm });
            const items = makeQuiz(text, "en");
            if (items.length) {
              setQuiz(items);
              setQi(0);
              setScore(0);
              setMode("quiz");
            }
            started.current = 0;
            return x;
          }
          return x + 1;
        });
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [run, wpm, mode, words.length]);

  // Тахистоскоп: вспышка слова на ~80–150 мс
  useEffect(() => {
    if (!run || mode !== "tachi") return;
    let cancelled = false;
    let idx = 0;
    started.current = performance.now();
    const tick = () => {
      if (cancelled) return;
      if (idx >= words.length) {
        setRun(false);
        setFlashOn(false);
        const elapsed = (performance.now() - started.current) / 1000;
        void saveResult({ mode: "tachi", wpm, words: words.length, elapsed, score: wpm });
        return;
      }
      setFlash(words[idx]!);
      setFlashOn(true);
      window.setTimeout(() => {
        if (cancelled) return;
        setFlashOn(false);
        idx += 1;
        window.setTimeout(tick, Math.max(200, msPerWord(wpm)));
      }, 120);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [run, mode, wpm, words]);

  // E-Pyr: пошаговый показ уровней
  useEffect(() => {
    if (!run || mode !== "epyr") return;
    let cancelled = false;
    let level = 0;
    started.current = performance.now();
    setPyrLevel(0);
    const step = () => {
      if (cancelled) return;
      if (level >= pyramid.length) {
        setRun(false);
        const elapsed = (performance.now() - started.current) / 1000;
        void saveResult({ mode: "epyr", wpm, words: pyramid.length, elapsed, score: pyramid.length });
        return;
      }
      setPyrLevel(level);
      level += 1;
      window.setTimeout(step, Math.max(400, msPerWord(Math.max(120, wpm / 2))));
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [run, mode, wpm, pyramid.length]);

  useEffect(() => {
    if (mode === "journal") void loadJournal(filterMode || undefined);
  }, [mode, filterMode]);

  const word = words[i] || "";
  const oi = orpIndex(word);

  const onSchulte = (n: number) => {
    if (n !== nextNum) return;
    if (nextNum === 1) started.current = performance.now();
    if (nextNum >= 25) {
      const elapsed = (performance.now() - started.current) / 1000;
      void saveResult({ mode: "schulte", wpm: 0, words: 25, elapsed, score: elapsed });
      setNextNum(1);
      setSchulte(Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5));
      started.current = 0;
      return;
    }
    setNextNum((x) => x + 1);
  };

  const modes: { id: Mode; label: string }[] = [
    { id: "rsvp", label: t("hyperdrive") },
    { id: "tachi", label: t("tachi") },
    { id: "epyr", label: t("epyr") },
    { id: "schulte", label: t("schulte") },
    { id: "quiz", label: t("quiz") },
    { id: "journal", label: t("journal") },
  ];

  return (
    <div className="speed">
      <div className="bridge-actions">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`hud-btn ${mode === m.id ? "amber" : ""}`}
            onClick={() => {
              setMode(m.id);
              setRun(false);
              if (m.id === "schulte") {
                setNextNum(1);
                setSchulte(Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5));
              }
              if (m.id === "quiz") {
                const items = makeQuiz(text, "en");
                setQuiz(items);
                setQi(0);
                setScore(0);
              }
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {msg && <p className="muted">{msg}</p>}

      {mode === "journal" ? (
        <>
          <div className="bridge-actions">
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
              <option value="">{t("all_modes")}</option>
              <option value="rsvp">RSVP</option>
              <option value="tachi">Tachi</option>
              <option value="epyr">E-Pyr</option>
              <option value="schulte">Schulte</option>
            </select>
          </div>
          <table className="honor">
            <thead>
              <tr>
                <th>mode</th>
                <th>wpm</th>
                <th>words</th>
                <th>s</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((r) => (
                <tr key={r.id}>
                  <td>{r.mode}</td>
                  <td>{Math.round(r.wpm)}</td>
                  <td>{r.words}</td>
                  <td>{r.elapsed.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : mode === "quiz" ? (
        quiz.length === 0 ? (
          <p className="muted">{t("quiz_need_text")}</p>
        ) : qi >= quiz.length ? (
          <p>
            {score}/{quiz.length}
          </p>
        ) : (
          <div className="quiz">
            <p>{quiz[qi]!.question}</p>
            <div className="bridge-actions">
              {quiz[qi]!.options.map((opt, oi2) => (
                <button
                  key={opt}
                  type="button"
                  className="hud-btn amber"
                  onClick={() => {
                    if (oi2 === quiz[qi]!.answer) setScore((s) => s + 1);
                    setQi((x) => x + 1);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )
      ) : mode === "schulte" ? (
        <>
          <p className="muted">
            {t("next_num")}: {nextNum}
          </p>
          <div className="schulte">
            {schulte.map((n) => (
              <button key={n} type="button" className="schulte-cell" onClick={() => onSchulte(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <textarea className="cargo-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="bridge-actions">
            <label>
              WPM{" "}
              <input type="number" value={wpm} min={100} max={1200} onChange={(e) => setWpm(Number(e.target.value))} />
            </label>
            <button
              type="button"
              className="hud-btn amber"
              onClick={() => {
                setI(0);
                started.current = 0;
                setMsg("");
                setRun(true);
              }}
            >
              {t("start")}
            </button>
            <button type="button" className="hud-btn" onClick={() => setRun(false)}>
              {t("pause")}
            </button>
          </div>
          {mode === "rsvp" && (
            <div className="rsvp">
              <span>{word.slice(0, oi)}</span>
              <span className="orp">{word[oi] ?? ""}</span>
              <span>{word.slice(oi + 1)}</span>
            </div>
          )}
          {mode === "tachi" && (
            <div className={`rsvp tachi ${flashOn ? "on" : ""}`}>{flashOn ? flash : "·"}</div>
          )}
          {mode === "epyr" && (
            <div className="epyr">
              {pyramid.slice(0, pyrLevel + 1).map((line, li) => (
                <div key={li} className="epyr-line">
                  {line}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
