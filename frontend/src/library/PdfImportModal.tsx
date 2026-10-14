/** Импорт PDF — порт stamina/pdf_dialog.PdfImportDialog (диапазон + превью + импорт). */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";

type Preview = {
  filename: string;
  total_pages: number;
  first: number;
  last: number;
  scanned: boolean;
  chars: number;
  removed: { page_numbers?: number; headers?: number };
  preview: string;
  preview_truncated: boolean;
  ok: boolean;
};

type Props = {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onImported?: (info: { text_id: number; title: string }) => void;
};

function fmtNum(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("ru-RU").replace(/,/g, " ");
}

export default function PdfImportModal({ open, file, onClose, onImported }: Props) {
  const [first, setFirst] = useState("1");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"cyan" | "ok" | "amber" | "danger">("cyan");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [body, setBody] = useState("");

  const reload = useCallback(
    async (opts?: { first?: string; last?: string }) => {
      if (!file) return;
      const f = (opts?.first ?? first).trim() || "1";
      const l = (opts?.last ?? last).trim();
      setBusy(true);
      setStatus(t("pdf_extracting"));
      setStatusTone("cyan");
      setPreview(null);
      setBody("");
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("first", f);
        fd.append("last", l);
        const r = await fetch("/api/texts/pdf/preview", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!r.ok) {
          setStatus(t("pdf_fail").replace("{0}", await r.text()));
          setStatusTone("danger");
          return;
        }
        const j = (await r.json()) as Preview;
        setPreview(j);
        if (!l && j.total_pages) {
          setLast(String(j.total_pages));
        }
        if (j.scanned) {
          setStatus(t("pdf_scanned"));
          setStatusTone("amber");
          setBody(t("pdf_scanned_help"));
          return;
        }
        setStatus(
          t("pdf_status")
            .replace("{0}", String(j.first))
            .replace("{1}", String(j.last))
            .replace("{2}", fmtNum(j.chars))
            .replace("{3}", String(j.removed?.page_numbers ?? 0))
            .replace("{4}", String(j.removed?.headers ?? 0)),
        );
        setStatusTone("ok");
        let shown = j.preview || "";
        if (j.preview_truncated) {
          shown += `\n\n${t("pdf_preview_more")}`;
        }
        setBody(shown);
      } catch (e) {
        setStatus(t("pdf_fail").replace("{0}", e instanceof Error ? e.message : String(e)));
        setStatusTone("danger");
      } finally {
        setBusy(false);
      }
    },
    [file, first, last],
  );

  useEffect(() => {
    if (!open || !file) return;
    setFirst("1");
    setLast("");
    setPreview(null);
    setBody("");
    void reload({ first: "1", last: "" });
    // только при открытии нового файла
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  if (!open || !file) return null;

  const canImport = Boolean(preview?.ok) && !busy;

  const importPdf = async () => {
    if (!canImport) return;
    setBusy(true);
    setStatus(t("pdf_importing"));
    setStatusTone("cyan");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("first", first.trim() || "1");
      fd.append("last", last.trim());
      fd.append("title", file.name.replace(/\.pdf$/i, ""));
      fd.append("lang", "und");
      const r = await fetch("/api/texts/pdf/import", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        setStatus(t("pdf_fail").replace("{0}", await r.text()));
        setStatusTone("danger");
        return;
      }
      const j = (await r.json()) as { id: number; title: string };
      onImported?.({ text_id: j.id, title: j.title });
      onClose();
    } catch (e) {
      setStatus(t("pdf_fail").replace("{0}", e instanceof Error ? e.message : String(e)));
      setStatusTone("danger");
    } finally {
      setBusy(false);
    }
  };

  const info =
    preview != null
      ? t("pdf_file_info")
          .replace("{0}", preview.filename)
          .replace("{1}", String(preview.total_pages))
      : file.name;

  return (
    <div className="gut-overlay" role="dialog" aria-modal="true" aria-label={t("pdf_title")}>
      <div className="lib-dlg pdf-dlg inst-panel">
        <header className="bi-manual-head">
          <h3 className="route-title amber">{t("pdf_title")}</h3>
          <button type="button" className="hud-btn" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="muted pdf-info">{info}</p>

        <div className="pdf-range">
          <span className="lab">{t("pdf_pages_from")}</span>
          <input
            className="pdf-page-inp"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload();
            }}
            disabled={busy}
            inputMode="numeric"
          />
          <span className="lab">{t("pdf_pages_to")}</span>
          <input
            className="pdf-page-inp"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload();
            }}
            disabled={busy}
            inputMode="numeric"
            placeholder={t("pdf_to_end")}
          />
          <button type="button" className="hud-btn" disabled={busy} onClick={() => void reload()}>
            {t("pdf_reload")}
          </button>
          <span className="muted pdf-range-note">{t("pdf_empty_end")}</span>
        </div>

        <p className={`pdf-status tone-${statusTone}`}>{status}</p>

        <textarea className="lib-dlg-ta pdf-preview" value={body} readOnly spellCheck={false} rows={16} />

        <footer className="lib-dlg-acts">
          <button type="button" className="hud-btn ok" disabled={!canImport} onClick={() => void importPdf()}>
            {busy && canImport ? "…" : t("pdf_import")}
          </button>
          <span className="muted bi-align-note">{t("pdf_import_note")}</span>
          <button type="button" className="hud-btn" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}
