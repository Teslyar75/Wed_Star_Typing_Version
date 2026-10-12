import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import { useReadingPos } from "../reading/positionStore";

type ShelfItem = {
  text_id: number;
  title: string;
  lang: string;
  source: string;
  sentence_id: number;
  mode: string;
  segments: number;
  progress_pct?: number;
};

type CatalogBook = {
  id: number;
  title: string;
  authors: string;
  languages: string[];
};

type BilinguisBook = {
  id: string;
  slug: string;
  title: string;
  author: string;
  lang_a: string;
  lang_b: string;
};

type Props = {
  onOpenReader?: () => void;
  onOpenBridge?: () => void;
  onOpenEnglish?: () => void;
  onOpenSpeed?: () => void;
};

export default function LibraryPanel({ onOpenReader, onOpenBridge, onOpenEnglish, onOpenSpeed }: Props) {
  const jump = useReadingPos((s) => s.jump);
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [query, setQuery] = useState("alice");
  const [hits, setHits] = useState<CatalogBook[]>([]);
  const [bili, setBili] = useState<BilinguisBook[]>([]);
  const [langB, setLangB] = useState("ru");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    const r = await fetch("/api/library", { credentials: "include" });
    if (r.ok) setShelf(await r.json());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const continueItem = shelf.find((x) => (x.sentence_id || 0) > 0) || shelf[0];

  const openItem = (it: ShelfItem, mode: "reader" | "bridge" | "english" | "speed") => {
    jump(it.text_id, it.sentence_id);
    void fetch(`/api/library/${it.text_id}/position`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence_id: it.sentence_id, mode }),
    });
    if (mode === "reader") onOpenReader?.();
    else if (mode === "bridge") onOpenBridge?.();
    else if (mode === "english") onOpenEnglish?.();
    else onOpenSpeed?.();
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name);
    fd.append("lang", "en");
    const r = await fetch("/api/texts/upload", { method: "POST", body: fd, credentials: "include" });
    setBusy(false);
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const doc = await r.json();
    await fetch("/api/library/shelf", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: doc.id }),
    });
    setMsg(`${t("library_ok")}: ${doc.title}`);
    void reload();
  };

  const search = async () => {
    setBusy(true);
    const r = await fetch(`/api/catalog/gutenberg/search?q=${encodeURIComponent(query)}`);
    setBusy(false);
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setHits(j.results || []);
  };

  const importBook = async (id: number, title: string) => {
    setBusy(true);
    const r = await fetch("/api/catalog/gutenberg/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gutenberg_id: id, title, lang: "en" }),
    });
    setBusy(false);
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setMsg(`${t("library_ok")}: ${j.title}`);
    void reload();
  };

  const loadBilinguis = async () => {
    setBusy(true);
    const r = await fetch(`/api/catalog/bilinguis/list?lang_a=en&lang_b=${encodeURIComponent(langB)}`);
    setBusy(false);
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setBili(j.results || []);
  };

  const importBilinguis = async (b: BilinguisBook) => {
    setBusy(true);
    setMsg(t("bilinguis_loading"));
    const r = await fetch("/api/catalog/bilinguis/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: b.slug, lang_a: b.lang_a, lang_b: b.lang_b, title: b.title }),
    });
    setBusy(false);
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setMsg(`${t("library_ok")}: ${j.title}`);
    void reload();
  };

  return (
    <section className="library">
      <h2>{t("library")}</h2>

      {continueItem && (
        <div className="bridge-actions" style={{ marginBottom: "0.75rem" }}>
          <button type="button" className="hud-btn amber" onClick={() => openItem(continueItem, continueItem.mode === "bridge" ? "bridge" : "reader")}>
            {t("continue_reading")}: {continueItem.title || `#${continueItem.text_id}`} ({Math.round(continueItem.progress_pct || 0)}%)
          </button>
        </div>
      )}

      <div className="bridge-actions">
        <label className="hud-btn">
          {busy ? "…" : t("upload_pdf")}
          <input
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            hidden
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {msg && <p className="muted">{msg}</p>}

      <h3>{t("shelf")}</h3>
      <ul className="mission-list">
        {shelf.map((it) => (
          <li key={it.text_id}>
            <strong>{it.title || `#${it.text_id}`}</strong>
            <span className="muted">
              {it.lang} · {it.segments} · {Math.round(it.progress_pct || 0)}% · {it.mode}
            </span>
            <button type="button" className="hud-btn" onClick={() => openItem(it, "reader")}>
              {t("reader")}
            </button>
            <button type="button" className="hud-btn amber" onClick={() => openItem(it, "bridge")}>
              {t("bridge")}
            </button>
            <button type="button" className="hud-btn" onClick={() => openItem(it, "english")}>
              {t("from_book")}
            </button>
            <button type="button" className="hud-btn" onClick={() => openItem(it, "speed")}>
              {t("speed")}
            </button>
          </li>
        ))}
        {!shelf.length && <li className="muted">{t("shelf_empty")}</li>}
      </ul>

      <h3>{t("bilinguis")}</h3>
      <div className="bridge-actions">
        <select value={langB} onChange={(e) => setLangB(e.target.value)}>
          <option value="ru">EN→RU</option>
          <option value="uk">EN→UK</option>
        </select>
        <button type="button" className="hud-btn" onClick={() => void loadBilinguis()} disabled={busy}>
          {t("search")}
        </button>
      </div>
      <ul className="mission-list">
        {bili.map((b) => (
          <li key={b.id}>
            <span>
              {b.title} <span className="muted">— {b.author}</span>
            </span>
            <button type="button" className="hud-btn" onClick={() => void importBilinguis(b)} disabled={busy}>
              {t("download")}
            </button>
          </li>
        ))}
      </ul>

      <h3>{t("catalog")}</h3>
      <div className="bridge-actions">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Gutenberg…" />
        <button type="button" className="hud-btn" onClick={() => void search()} disabled={busy}>
          {t("search")}
        </button>
      </div>
      <ul className="mission-list">
        {hits.map((b) => (
          <li key={b.id}>
            <span>
              {b.title} <span className="muted">— {b.authors}</span>
            </span>
            <button type="button" className="hud-btn" onClick={() => void importBook(b.id, b.title)} disabled={busy}>
              {t("download")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
