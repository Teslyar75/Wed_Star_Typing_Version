import { useEffect, useRef, useState } from "react";

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
  const words = text.split(/\s+/).filter(Boolean);
  const raf = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (!run || mode !== "rsvp") return;
    const ms = 60000 / wpm;
    const loop = (t: number) => {
      if (t - last.current >= ms) {
        last.current = t;
        setI((x) => {
          if (x + 1 >= words.length) {
            setRun(false);
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

  const schulte = Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5);

  return (
    <div className="speed">
      <div className="bridge-actions">
        <button type="button" className={`hud-btn ${mode === "rsvp" ? "amber" : ""}`} onClick={() => setMode("rsvp")}>
          Гипердрайв
        </button>
        <button type="button" className={`hud-btn ${mode === "schulte" ? "amber" : ""}`} onClick={() => setMode("schulte")}>
          Шульте 5×5
        </button>
      </div>
      {mode === "rsvp" ? (
        <>
          <textarea className="cargo-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="bridge-actions">
            <label>
              WPM{" "}
              <input type="number" value={wpm} min={100} max={1200} onChange={(e) => setWpm(Number(e.target.value))} />
            </label>
            <button type="button" className="hud-btn amber" onClick={() => { setI(0); setRun(true); }}>
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
        <div className="schulte">
          {schulte.map((n) => (
            <button key={n} type="button" className="schulte-cell">
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
