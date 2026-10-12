import { useCallback, useEffect, useState } from "react";
import { listenOnce } from "./asr";
import { t } from "../i18n";
import { useRadio } from "../radio/radioStore";
import { useReadingPos } from "../reading/positionStore";

type Word = { id: number; word: string; translation: string; example: string };
type Bin = "due" | "favorite" | "learned" | "inbox";
type Progress = {
  xp: number;
  rank: string;
  favorite: number;
  learned: number;
  inbox: number;
  due: number;
};

export default function EnglishPanel() {
  const textId = useReadingPos((s) => s.textId);
  const sentenceId = useReadingPos((s) => s.sentenceId);
  const [bin, setBin] = useState<Bin>("due");
  const [words, setWords] = useState<Word[]>([]);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [prog, setProg] = useState<Progress | null>(null);
  const [msg, setMsg] = useState("");
  const setDuck = useRadio((s) => s.setDuck);

  const reload = useCallback(async () => {
    await fetch("/api/english/seed?limit=20000", { method: "POST" });
    const list = await (
      await fetch(`/api/english/warehouse?limit=30&bin=${bin}`, { credentials: "include" })
    ).json();
    setWords(list);
    setI(0);
    const p = await (await fetch("/api/english/progress", { credentials: "include" })).json();
    setProg(p);
  }, [bin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const w = words[i];

  const speak = () => {
    if (!w || !window.speechSynthesis) return;
    setSpeaking(true);
    setDuck(true);
    const u = new SpeechSynthesisUtterance(w.word);
    u.lang = "en-US";
    u.onend = () => {
      setSpeaking(false);
      setDuck(false);
    };
    window.speechSynthesis.speak(u);
  };

  const listen = async () => {
    if (!w) return;
    setListening(true);
    setDuck(true);
    setHeard("");
    setScore(null);
    const res = await listenOnce({
      expected: w.example || w.word,
      targetWord: w.word,
      onInterim: setHeard,
      onLevel: setLevel,
    });
    setListening(false);
    setDuck(false);
    setHeard(res.transcript || (res.engine === "none" ? t("asr_unavailable") : ""));
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
    void reload();
  };

  const move = async (target: "favorite" | "learned" | "inbox") => {
    if (!w) return;
    await fetch("/api/english/move", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, bin: target }),
    });
    void reload();
  };

  const fromBook = async () => {
    if (textId == null) {
      setMsg(t("from_book_need"));
      return;
    }
    const r = await fetch("/api/english/from-book", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: textId, up_to_sentence_id: sentenceId + 20, limit: 24 }),
    });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setMsg(`${t("from_book")}: ${j.cards}`);
    setBin("inbox");
  };

  return (
    <div className="english">
      {prog && (
        <p className="muted">
          {prog.rank} · XP {prog.xp} · ★{prog.favorite} · ✓{prog.learned} · due {prog.due}
        </p>
      )}
      <div className="bridge-actions">
        {(["due", "inbox", "favorite", "learned"] as Bin[]).map((b) => (
          <button key={b} type="button" className={`hud-btn ${bin === b ? "amber" : ""}`} onClick={() => setBin(b)}>
            {t(`bin_${b}`)}
          </button>
        ))}
        <button type="button" className="hud-btn" onClick={() => void fromBook()}>
          {t("from_book")}
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}

      {!w ? (
        <p className="lead">{t("vocab_loading")}</p>
      ) : (
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
              {t("voice")}
            </button>
            <button type="button" className="hud-btn" onClick={() => void listen()}>
              {t("mic")}
            </button>
            <button type="button" className="hud-btn amber" onClick={() => setShow(true)}>
              {t("show")}
            </button>
            <button type="button" className="hud-btn" onClick={() => void move("favorite")}>
              ★
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
      )}
    </div>
  );
}
