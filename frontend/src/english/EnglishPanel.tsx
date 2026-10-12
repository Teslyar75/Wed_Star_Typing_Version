import { useEffect, useState } from "react";
import { listenOnce } from "./asr";
import { t } from "../i18n";

type Word = { id: number; word: string; translation: string; example: string };

export default function EnglishPanel() {
  const [words, setWords] = useState<Word[]>([]);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    void (async () => {
      await fetch("/api/english/seed?limit=20000", { method: "POST" });
      const list = await (await fetch("/api/english/warehouse?limit=30", { credentials: "include" })).json();
      setWords(list);
    })();
  }, []);

  const w = words[i];

  const speak = () => {
    if (!w || !window.speechSynthesis) return;
    setSpeaking(true);
    const u = new SpeechSynthesisUtterance(w.word);
    u.lang = "en-US";
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const listen = async () => {
    if (!w) return;
    setListening(true);
    setHeard("");
    setScore(null);
    const res = await listenOnce({
      expected: w.example || w.word,
      targetWord: w.word,
      onInterim: setHeard,
      onLevel: setLevel,
    });
    setListening(false);
    setHeard(res.transcript || (res.engine === "none" ? "(ASR недоступен)" : ""));
    setScore(res.engine === "none" ? null : res.score);
    setLevel(0);
  };

  const grade = async (g: number) => {
    if (!w) return;
    await fetch("/api/english/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, grade: g }),
    });
    setShow(false);
    setHeard("");
    setScore(null);
    setI((x) => (x + 1) % Math.max(words.length, 1));
  };

  if (!w) return <p className="lead">Загрузка словаря…</p>;

  return (
    <div className="english">
      <div className="card">
        <h2>{w.word}</h2>
        {speaking && <span className="badge ok">{t("reading")}</span>}
        {listening && (
          <span className="badge ok">
            {t("listening")} {Math.round(level)}%
          </span>
        )}
        <div className="bridge-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="hud-btn" onClick={speak}>
            🔊 Голос
          </button>
          <button type="button" className="hud-btn" onClick={() => void listen()}>
            🎤 Микрофон
          </button>
          <button type="button" className="hud-btn amber" onClick={() => setShow(true)}>
            Показать
          </button>
        </div>
        {heard && <p className="muted">Услышано: {heard}</p>}
        {score != null && <p>Совпадение: {score}%</p>}
        {listening && (
          <div className="mic-meter" aria-hidden>
            <div style={{ width: `${level}%` }} />
          </div>
        )}
        {show && (
          <>
            <p>{w.translation}</p>
            <p className="muted">{w.example}</p>
            <div className="bridge-actions">
              {[1, 2, 3, 4].map((g) => (
                <button key={g} type="button" className="hud-btn" onClick={() => void grade(g)}>
                  {g}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
