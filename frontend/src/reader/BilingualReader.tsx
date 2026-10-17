import { speakText } from "../english/speak";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { t } from "../i18n";
import { useReadingPos } from "../reading/positionStore";
import { pageIndexForSentence, paginate } from "./paginate";

type Row = { idx: number; original: string; translation: string; status: string; sentence_id: number };
type Mode = "bi" | "screen1" | "screen2";

export default function BilingualReader() {
  const { textId: storeTextId, sentenceId, jump, setSentence } = useReadingPos();
  const [textId, setTextId] = useState<number | "">(storeTextId ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<Mode>("bi");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);

  const pages = useMemo(() => paginate(rows, mode === "screen2" ? 700 : 1100), [rows, mode]);

  useEffect(() => {
    if (storeTextId != null && storeTextId !== textId) setTextId(storeTextId);
  }, [storeTextId]);

  useEffect(() => {
    if (!pages.length) return;
    setPageIdx(pageIndexForSentence(pages, sentenceId));
  }, [sentenceId, pages]);

  const fetchRows = async (id: number, from = 0, append = false) => {
    const data: Row[] = await (await fetch(`/api/reader/${id}/bilingual?offset=${from}&limit=200`)).json();
    setRows((prev) => (append ? [...prev, ...data] : data));
    if (!append && data[0] && sentenceId === 0) setSentence(data[0].sentence_id);
    setOffset(from + data.length);
    return data.length;
  };

  const load = async () => {
    if (!textId) return;
    const id = Number(textId);
    jump(id, sentenceId);
    setStatus(t("translate_queued"));
    setRows([]);
    setOffset(0);
    await fetch("/api/reader/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: id, src_lang: "en", dst_lang: "ru", async_mode: true }),
    });
    await fetchRows(id, 0, false);
    for (let k = 0; k < 8; k++) {
      await new Promise((r) => setTimeout(r, 400));
      await fetchRows(id, 0, false);
      const st = await (await fetch("/api/reader/translate/status")).json();
      setStatus(`очередь: pending ${st.pending}, done ${st.done}`);
      if (st.pending === 0 && st.done > 0) break;
    }
  };

  const loadMore = useCallback(async () => {
    if (!textId) return;
    const n = await fetchRows(Number(textId), offset, true);
    if (n === 0) setStatus(t("end_of_text"));
  }, [textId, offset]);

  const speak = (text: string) => {
    speakText(text);
  };

  const selectSentence = (id: number, text: string) => {
    setSentence(id);
    speak(text);
  };

  const page = pages[pageIdx];
  const cols = mode === "screen2" ? 2 : 1;

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
          {t("load")}
        </button>
        <button type="button" className={`hud-btn ${mode === "bi" ? "amber" : ""}`} onClick={() => setMode("bi")}>
          {t("reader")}
        </button>
        <button
          type="button"
          className={`hud-btn ${mode === "screen1" ? "amber" : ""}`}
          onClick={() => setMode("screen1")}
        >
          {t("screen")} 1
        </button>
        <button
          type="button"
          className={`hud-btn ${mode === "screen2" ? "amber" : ""}`}
          onClick={() => setMode("screen2")}
        >
          {t("screen")} 2
        </button>
      </div>
      {status && <p className="muted">{status}</p>}
      <p className="muted">
        text #{textId || "—"} · sentence_id {sentenceId}
        {mode !== "bi" && pages.length > 0 ? ` · стр. ${pageIdx + 1}/${pages.length}` : ""}
      </p>

      {mode === "bi" ? (
        <div className="bi-virt">
          <Virtuoso
            style={{ height: 420 }}
            data={rows}
            endReached={() => void loadMore()}
            itemContent={(_i, r) => (
              <div
                className={`bi-row ${r.sentence_id === sentenceId ? "on" : ""}`}
                onClick={() => selectSentence(r.sentence_id, r.original)}
              >
                <div>{r.original}</div>
                <div className="tr">{r.translation}</div>
              </div>
            )}
          />
        </div>
      ) : (
        <div className="screen-pager">
          <div className="bridge-actions">
            <button
              type="button"
              className="hud-btn"
              disabled={pageIdx <= 0}
              onClick={() => {
                const p = pages[pageIdx - 1];
                if (p) {
                  setPageIdx(pageIdx - 1);
                  setSentence(p.fromId);
                }
              }}
            >
              ←
            </button>
            <button
              type="button"
              className="hud-btn"
              disabled={pageIdx >= pages.length - 1}
              onClick={() => {
                const p = pages[pageIdx + 1];
                if (p) {
                  setPageIdx(pageIdx + 1);
                  setSentence(p.fromId);
                }
              }}
            >
              →
            </button>
          </div>
          <div className={`screen-cols cols-${cols}`}>
            {(page?.items || []).map((r) => (
              <p
                key={r.sentence_id}
                className={r.sentence_id === sentenceId ? "on" : ""}
                onClick={() => selectSentence(r.sentence_id, r.original)}
              >
                {r.original}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
