import { useEffect, useState } from "react";

type Word = { id: number; word: string; translation: string; example: string };

export default function EnglishPanel() {
  const [words, setWords] = useState<Word[]>([]);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    void (async () => {
      await fetch("/api/english/seed", { method: "POST" });
      const list = await (await fetch("/api/english/words")).json();
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

  const grade = async (g: number) => {
    if (!w) return;
    await fetch("/api/english/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, grade: g, pilot_id: 1 }),
    });
    setShow(false);
    setI((x) => (x + 1) % Math.max(words.length, 1));
  };

  if (!w) return <p className="lead">Загрузка словаря…</p>;

  return (
    <div className="english">
      <div className="card">
        <h2>{w.word}</h2>
        {speaking && <span className="badge ok">ЧИТАЕТ…</span>}
        <button type="button" className="hud-btn" onClick={speak}>
          🔊 Голос
        </button>
        <button type="button" className="hud-btn amber" onClick={() => setShow(true)}>
          Пробел / показать
        </button>
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
