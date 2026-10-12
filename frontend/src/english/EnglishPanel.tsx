import { useEffect, useState } from "react";
import { scoreSentence } from "./textutil";

type Word = { id: number; word: string; translation: string; example: string };

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } }; length: number; isFinal?: boolean } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SR) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

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
      await fetch("/api/english/seed?limit=500", { method: "POST" });
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

  const listen = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || !w) {
      setHeard("(SpeechRecognition недоступен — нужен Chrome/Edge; vosk-browser — следующий шаг)");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    setListening(true);
    setHeard("");
    setScore(null);
    // уровень микрофона — приближение через interim пульс
    const pulse = window.setInterval(() => setLevel((x) => (x + 17) % 100), 120);
    rec.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      const text = last?.[0]?.transcript || "";
      setHeard(text);
      if ((last as { isFinal?: boolean })?.isFinal || ev.results.length) {
        const expected = w.example || w.word;
        const { score: sc } = scoreSentence(expected, text, w.word);
        setScore(sc);
      }
    };
    rec.onerror = () => {
      setListening(false);
      window.clearInterval(pulse);
      setLevel(0);
    };
    rec.onend = () => {
      setListening(false);
      window.clearInterval(pulse);
      setLevel(0);
    };
    rec.start();
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
        {speaking && <span className="badge ok">ЧИТАЕТ…</span>}
        {listening && <span className="badge ok">СЛУШАЮ… {level}%</span>}
        <div className="bridge-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="hud-btn" onClick={speak}>
            🔊 Голос
          </button>
          <button type="button" className="hud-btn" onClick={listen}>
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
