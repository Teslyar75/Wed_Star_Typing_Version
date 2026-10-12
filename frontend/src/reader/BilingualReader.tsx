import { useState } from "react";

type Row = { idx: number; original: string; translation: string; status: string; sentence_id: number };

export default function BilingualReader() {
  const [textId, setTextId] = useState<number | "">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"bi" | "screen">("bi");

  const load = async () => {
    if (!textId) return;
    await fetch("/api/reader/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: Number(textId), src_lang: "en", dst_lang: "ru" }),
    });
    const data = await (await fetch(`/api/reader/${textId}/bilingual?limit=200`)).json();
    setRows(data);
    setActive(data[0]?.sentence_id ?? 0);
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="reader">
      <div className="bridge-actions">
        <input
          type="number"
          placeholder="text id"
          value={textId}
          onChange={(e) => setTextId(e.target.value ? Number(e.target.value) : "")}
        />
        <button type="button" className="hud-btn" onClick={() => void load()}>
          Загрузить
        </button>
        <button type="button" className={`hud-btn ${mode === "bi" ? "amber" : ""}`} onClick={() => setMode("bi")}>
          2 языка
        </button>
        <button type="button" className={`hud-btn ${mode === "screen" ? "amber" : ""}`} onClick={() => setMode("screen")}>
          Экран
        </button>
      </div>
      {mode === "bi" ? (
        <div className="bi-grid">
          {rows.map((r) => (
            <div
              key={r.idx}
              className={`bi-row ${r.sentence_id === active ? "on" : ""}`}
              onClick={() => {
                setActive(r.sentence_id);
                speak(r.original);
              }}
            >
              <div>{r.original}</div>
              <div className="tr">{r.translation}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="screen-page">
          {rows
            .filter((r) => r.sentence_id >= active)
            .slice(0, 12)
            .map((r) => (
              <p key={r.idx} className={r.sentence_id === active ? "on" : ""}>
                {r.original}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
