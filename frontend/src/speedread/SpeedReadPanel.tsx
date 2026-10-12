import { useEffect, useRef, useState } from "react";
import { msPerWord } from "./timing";

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
  const [mode, setMode] = useState<"rsvp" | "schulte">("rsvp");
  const [msg, setMsg] = useState("");
  const [schulte, setSchulte] = useState(() =>
    Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5),
  );
  const [nextNum, setNextNum] = useState(1);
  const words = text.split(/\s+/).filter(Boolean);
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
    if (r.ok) setMsg("Результат сохранён");
  };

  useEffect(() => {
    if (!run || mode !== "rsvp") return;
    const ms = msPerWord(wpm);
    if (!started.current) started.current = performance.now();
    const loop = (t: number) => {
      if (t - last.current >= ms) {
        last.current = t;
        setI((x) => {
          if (x + 1 >= words.length) {
            setRun(false);
            const elapsed = (performance.now() - started.current) / 1000;
            void saveResult({ mode: "rsvp", wpm, words: words.length, elapsed, score: wpm });
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

  return (
    <div className="speed">
      <div className="bridge-actions">
        <button type="button" className={`hud-btn ${mode === "rsvp" ? "amber" : ""}`} onClick={() => setMode("rsvp")}>
          Гипердрайв
        </button>
        <button
          type="button"
          className={`hud-btn ${mode === "schulte" ? "amber" : ""}`}
          onClick={() => {
            setMode("schulte");
            setNextNum(1);
            setSchulte(Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5));
          }}
        >
          Шульте 5×5
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {mode === "rsvp" ? (
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
              ▶ Старт
            </button>
            <button type="button" className="hud-btn" onClick={() => setRun(false)}>
              Пауза
            </button>
          </div>
          <div className="rsvp">
            <span>{word.slice(0, oi)}</span>
            <span className="orp">{word[oi] ?? ""}</span>
            <span>{word.slice(oi + 1)}</span>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Следующее число: {nextNum}</p>
          <div className="schulte">
            {schulte.map((n) => (
              <button key={n} type="button" className="schulte-cell" onClick={() => onSchulte(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
