import { useCallback, useState } from "react";
import { Virtuoso } from "react-virtuoso";

type Row = { idx: number; original: string; translation: string; status: string; sentence_id: number };

export default function BilingualReader() {
  const [textId, setTextId] = useState<number | "">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"bi" | "screen">("bi");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const fetchRows = async (id: number, from = 0, append = false) => {
    const data: Row[] = await (await fetch(`/api/reader/${id}/bilingual?offset=${from}&limit=200`)).json();
    setRows((prev) => (append ? [...prev, ...data] : data));
    if (!append && data[0]) setActive(data[0].sentence_id);
    setOffset(from + data.length);
    return data.length;
  };

  const load = async () => {
    if (!textId) return;
    setStatus("перевод в очереди…");
    setRows([]);
    setOffset(0);
    await fetch("/api/reader/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: Number(textId), src_lang: "en", dst_lang: "ru", async_mode: true }),
    });
    await fetchRows(Number(textId), 0, false);
    for (let k = 0; k < 8; k++) {
      await new Promise((r) => setTimeout(r, 400));
      await fetchRows(Number(textId), 0, false);
      const st = await (await fetch("/api/reader/translate/status")).json();
      setStatus(`очередь: pending ${st.pending}, done ${st.done}`);
      if (st.pending === 0 && st.done > 0) break;
    }
  };

  const loadMore = useCallback(async () => {
    if (!textId) return;
    const n = await fetchRows(Number(textId), offset, true);
    if (n === 0) setStatus("конец текста");
  }, [textId, offset]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const screenRows = rows.filter((r) => r.sentence_id >= active).slice(0, 24);

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
      {status && <p className="muted">{status}</p>}
      {mode === "bi" ? (
        <div className="bi-virt">
          <Virtuoso
            style={{ height: 420 }}
            data={rows}
            endReached={() => void loadMore()}
            itemContent={(_i, r) => (
              <div
                className={`bi-row ${r.sentence_id === active ? "on" : ""}`}
                onClick={() => {
                  setActive(r.sentence_id);
                  speak(r.original);
                }}
              >
                <div>{r.original}</div>
                <div className="tr">{r.translation}</div>
              </div>
            )}
          />
        </div>
      ) : (
        <div className="screen-page">
          {screenRows.map((r) => (
            <p key={r.idx} className={r.sentence_id === active ? "on" : ""}>
              {r.original}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
