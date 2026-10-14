/** ОТСЕКИ — грузовые отсеки как tab_06. */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { EnWord } from "./types";

type ListRow = { id: number; name: string; kind: string; count: number };

type Props = {
  onOpenScanner: (word: string) => void;
  onMissionFromList: (listId: number) => void;
  onReviewFromList: (listId: number) => void;
};

export default function ListsPage({ onOpenScanner, onMissionFromList, onReviewFromList }: Props) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [words, setWords] = useState<EnWord[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reloadLists = useCallback(async () => {
    const r = await fetch("/api/english/lists", { credentials: "include" });
    if (!r.ok) return;
    const rows = (await r.json()) as ListRow[];
    setLists(rows);
    setSel((cur) => cur ?? rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void reloadLists();
  }, [reloadLists]);

  useEffect(() => {
    if (sel == null) {
      setWords([]);
      return;
    }
    void (async () => {
      const r = await fetch(`/api/english/lists/${sel}/words`, { credentials: "include" });
      if (r.ok) setWords(await r.json());
    })();
  }, [sel]);

  const create = async () => {
    const n = name.trim() || t("en_list_name");
    const r = await fetch("/api/english/lists", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    if (r.ok) {
      setName("");
      void reloadLists();
    }
  };

  const removeWord = async (wordId: number) => {
    if (sel == null) return;
    await fetch(`/api/english/lists/${sel}/words/${wordId}`, { method: "DELETE", credentials: "include" });
    setWords((ws) => ws.filter((w) => w.id !== wordId));
    void reloadLists();
  };

  const delList = async () => {
    if (sel == null) return;
    const row = lists.find((x) => x.id === sel);
    if (!row || row.kind === "favorite") {
      setMsg(t("en_list_fav_locked"));
      return;
    }
    await fetch(`/api/english/lists/${sel}`, { method: "DELETE", credentials: "include" });
    setSel(null);
    void reloadLists();
  };

  const exportCsv = () => {
    const lines = [
      "word,translation,example",
      ...words.map((w) => `"${w.word}","${w.translation}","${(w.example || "").replace(/"/g, '""')}"`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "english-list.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importTxt = async (file: File) => {
    if (sel == null) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    let n = 0;
    for (const line of lines.slice(0, 200)) {
      const word = line.split(/[;,\t]/)[0]?.trim();
      if (!word) continue;
      const look = await fetch(`/api/english/lookup?q=${encodeURIComponent(word)}`, { credentials: "include" });
      if (!look.ok) continue;
      const w = (await look.json()) as EnWord;
      await fetch(`/api/english/lists/${sel}/words`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: w.id }),
      });
      n += 1;
    }
    setMsg(t("en_book_formed").replace("{0}", String(n)));
    void reloadLists();
    if (sel != null) {
      const r = await fetch(`/api/english/lists/${sel}/words`, { credentials: "include" });
      if (r.ok) setWords(await r.json());
    }
  };

  const cur = lists.find((x) => x.id === sel);
  const known = words.filter((w) => w.known).length;

  return (
    <section className="en-lists">
      <div className="en-lists-grid">
        <aside className="inst-panel en-lists-side">
          <div className="lab">{t("en_lists_title")}</div>
          <ul className="en-list-nav">
            {lists.map((l) => (
              <li key={l.id}>
                <button type="button" className={sel === l.id ? "on" : ""} onClick={() => setSel(l.id)}>
                  <span>{l.kind === "favorite" ? "★ " : "▤ "}{l.name}</span>
                  <span className="muted mono">{l.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="en-list-new-col">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("en_list_name")} />
            <button type="button" className="hud-btn" onClick={() => void create()}>
              {t("en_list_new")}
            </button>
            <button type="button" className="hud-btn" onClick={() => fileRef.current?.click()}>
              {t("en_list_import")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importTxt(f);
                e.target.value = "";
              }}
            />
          </div>
        </aside>
        <div className="inst-panel en-lists-main">
          <header className="en-lists-main-head">
            <h2 className="route-title">{cur?.name || "—"}</h2>
            <p className="muted">
              {words.length} · {t("en_status_known").toLowerCase()}/{t("bin_learned").toLowerCase()} {known}
            </p>
          </header>
          <div className="bridge-actions">
            <button
              type="button"
              className="hud-btn amber"
              disabled={sel == null || !words.length}
              onClick={() => sel != null && onReviewFromList(sel)}
            >
              {t("en_list_review")}
            </button>
            <button
              type="button"
              className="hud-btn"
              disabled={sel == null || !words.length}
              onClick={() => sel != null && onMissionFromList(sel)}
            >
              {t("en_mission_list")}
            </button>
            <button type="button" className="hud-btn" disabled={!words.length} onClick={exportCsv}>
              {t("en_export_csv")}
            </button>
            <button type="button" className="hud-btn danger" onClick={() => void delList()}>
              {t("en_list_delete")}
            </button>
          </div>
          {words.length ? (
            <ul className="en-list-words">
              {words.map((w) => (
                <li key={w.id} className="en-list-word-row">
                  <button type="button" className="linkish" onClick={() => onOpenScanner(w.word)}>
                    <strong>{w.word}</strong>
                  </button>
                  <span className="muted">{w.translation}</span>
                  <button type="button" className="hud-btn" onClick={() => void removeWord(w.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="en-lists-empty muted">{t("en_list_empty")}</p>
          )}
          {msg && <p className="muted">{msg}</p>}
        </div>
      </div>
    </section>
  );
}
