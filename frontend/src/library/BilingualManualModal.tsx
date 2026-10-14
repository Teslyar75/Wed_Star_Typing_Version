/** Ручной импорт 2ЯЗ — порт stamina/bilingual_dialog.BilingualImportDialog. */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (info: { text_id: number; title: string }) => void;
  defaultLangA?: string;
  defaultLangB?: string;
};

type SrcKind = "pd" | "mt" | "mixed";

async function readTxtFile(file: File): Promise<string> {
  const text = await file.text();
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export default function BilingualManualModal({
  open,
  onClose,
  onImported,
  defaultLangA = "en",
  defaultLangB = "ru",
}: Props) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [langA, setLangA] = useState(defaultLangA);
  const [langB, setLangB] = useState(defaultLangB);
  const [sourceKind, setSourceKind] = useState<SrcKind>("mt");
  const [original, setOriginal] = useState("");
  const [translation, setTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const origRef = useRef<HTMLInputElement>(null);
  const trRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLangA(defaultLangA || "en");
    setLangB(defaultLangB || "ru");
    setMsg("");
  }, [open, defaultLangA, defaultLangB]);

  if (!open) return null;

  const loadFile = async (which: "a" | "b", file: File | null) => {
    if (!file) return;
    try {
      const text = await readTxtFile(file);
      if (which === "a") {
        setOriginal(text);
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^.]+$/, ""));
        }
      } else {
        setTranslation(text);
      }
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    const o = original.trim();
    const tr = translation.trim();
    if (!o || !tr) {
      setMsg(t("bi_need_both"));
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/texts/bilingual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || t("bi_untitled"),
          author: author.trim(),
          lang_src: langA.trim() || "en",
          lang_tgt: langB.trim() || "ru",
          original: o,
          translation: tr,
          source_kind: sourceKind,
        }),
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const j = (await r.json()) as { id: number; title: string };
      onImported?.({ text_id: j.id, title: j.title });
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gut-overlay" role="dialog" aria-modal="true" aria-label={t("bi_manual_title")}>
      <div className="lib-dlg bi-manual-dlg inst-panel">
        <header className="bi-manual-head">
          <h3 className="route-title">{t("bi_manual_title")}</h3>
          <button type="button" className="hud-btn" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>
        <p className="muted bi-manual-hint">{t("bi_manual_hint")}</p>

        <div className="bi-manual-meta">
          <label className="lib-dlg-field">
            <span className="lab">{t("gut_title_field")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </label>
          <label className="lib-dlg-field">
            <span className="lab">{t("gut_author")}</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} disabled={busy} />
          </label>
          <label className="lib-dlg-field bi-lang-field">
            <span className="lab">{t("gut_orig")}</span>
            <input value={langA} onChange={(e) => setLangA(e.target.value)} disabled={busy} maxLength={8} />
          </label>
          <label className="lib-dlg-field bi-lang-field">
            <span className="lab">{t("gut_trans")}</span>
            <input value={langB} onChange={(e) => setLangB(e.target.value)} disabled={busy} maxLength={8} />
          </label>
        </div>

        <div className="bi-manual-src">
          <span className="lab">{t("bi_source")}</span>
          {(
            [
              ["pd", "PD"],
              ["mt", "MT"],
              ["mixed", "PD+MT"],
            ] as const
          ).map(([code, lab]) => (
            <button
              key={code}
              type="button"
              className={`hud-btn ${sourceKind === code ? "ok" : ""}`}
              disabled={busy}
              onClick={() => setSourceKind(code)}
            >
              {lab}
            </button>
          ))}
          <span className="muted bi-src-note">{t("bi_source_note")}</span>
        </div>

        <div className="bi-manual-cols">
          <div className="bi-col">
            <div className="bi-col-head">
              <span className="lab">{t("sr_original")}</span>
              <button
                type="button"
                className="hud-btn"
                disabled={busy}
                onClick={() => origRef.current?.click()}
              >
                {t("bi_from_file")}
              </button>
              <input
                ref={origRef}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={(e) => void loadFile("a", e.target.files?.[0] ?? null)}
              />
            </div>
            <textarea
              className="lib-dlg-ta bi-col-ta"
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              disabled={busy}
              rows={12}
              spellCheck={false}
            />
          </div>
          <div className="bi-col">
            <div className="bi-col-head">
              <span className="lab">{t("hd_translation")}</span>
              <button
                type="button"
                className="hud-btn"
                disabled={busy}
                onClick={() => trRef.current?.click()}
              >
                {t("bi_from_file")}
              </button>
              <input
                ref={trRef}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={(e) => void loadFile("b", e.target.files?.[0] ?? null)}
              />
            </div>
            <textarea
              className="lib-dlg-ta bi-col-ta"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              disabled={busy}
              rows={12}
              spellCheck={false}
            />
          </div>
        </div>

        {msg ? <p className="mission-map-hint gut-msg">{msg}</p> : null}

        <footer className="lib-dlg-acts">
          <button type="button" className="hud-btn ok" disabled={busy} onClick={() => void save()}>
            {busy ? "…" : t("bi_save")}
          </button>
          <span className="muted bi-align-note">{t("bi_align_note")}</span>
          <button type="button" className="hud-btn" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}
