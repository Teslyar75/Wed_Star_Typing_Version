/**
 * Библиотека скорочтения — порт stamina/speedread/screen.py LibraryPage.
 * Слева: ТЕКСТЫ НА БОРТУ · справа: ПАСПОРТ ТЕКСТА.
 * Каталоги: свободные Gutenberg / поиск / 2ЯЗ (BookCatalogPanel).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { sendTextToBridge } from "./sendToBridge";
import { useReadingPos } from "../reading/positionStore";
import { setModalStack } from "../shell/routeStore";
import GutenbergModal from "./GutenbergModal";
import PdfImportModal from "./PdfImportModal";

type ShelfItem = {
  text_id: number;
  title: string;
  author?: string;
  lang: string;
  source: string;
  sentence_id: number;
  mode: string;
  segments: number;
  progress_pct?: number;
  chars?: number;
  words?: number;
  bilingual?: boolean;
  print_allowed?: boolean;
};

type Props = {
  /** ▶ ГИПЕРДРАЙВ */
  onOpenHyperdrive?: () => void;
  /** 📖 КНИГА */
  onOpenBook?: () => void;
  /** ⌨ ПЕЧАТАТЬ → Свой текст / мостик */
  onOpenBridge?: () => void;
  onOpenEnglish?: () => void;
  /** @deprecated aliases */
  onOpenReader?: () => void;
  onOpenSpeed?: () => void;
};

type Badge = { code: string; tone: "green" | "cyan" | "amber" | "red" | "muted" };

function badgesOf(it: ShelfItem): Badge[] {
  if (!it.bilingual) return [];
  const src = (it.source || "").toLowerCase();
  const srcCode = src.includes("bilingu") || src.includes("pd") ? "PD" : src.includes("mt") ? "MT" : "PD";
  return [
    { code: "2ЯЗ", tone: "green" },
    { code: srcCode, tone: "cyan" },
    { code: "⌀ред.", tone: "amber" },
    { code: "⌀печ.", tone: "amber" },
  ];
}

function fmtNum(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("ru-RU").replace(/,/g, " ");
}

export default function LibraryPanel({
  onOpenHyperdrive,
  onOpenBook,
  onOpenBridge,
  onOpenReader,
  onOpenSpeed,
}: Props) {
  const jump = useReadingPos((s) => s.jump);
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [gutOpen, setGutOpen] = useState(false);
  const [biliOpen, setBiliOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameAuthor, setRenameAuthor] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  /* gutenberg/bilingual/manual — стек крошек внутри GutenbergModal */
  useEffect(() => {
    const mods: { slug: string; label: string }[] = [];
    if (pdfOpen) mods.push({ slug: "pdf", label: t("pdf_title") });
    if (pasteOpen) mods.push({ slug: "paste", label: t("lib_paste_title") });
    if (renameOpen) mods.push({ slug: "rename", label: t("lib_rename") });
    if (!gutOpen && !biliOpen) setModalStack(mods);
    return () => {
      if (!gutOpen && !biliOpen) setModalStack([]);
    };
  }, [pdfOpen, pasteOpen, renameOpen, gutOpen, biliOpen]);

  useEffect(() => {
    const onGo = (e: Event) => {
      const slugs = ((e as CustomEvent<{ slugs: string[] }>).detail?.slugs || []) as string[];
      if (!slugs.includes("gutenberg")) setGutOpen(false);
      if (!slugs.includes("bilingual")) setBiliOpen(false);
      if (!slugs.includes("pdf")) {
        setPdfOpen(false);
        setPdfFile(null);
      }
      if (!slugs.includes("paste")) setPasteOpen(false);
      if (!slugs.includes("rename")) setRenameOpen(false);
    };
    window.addEventListener("st-crumb-go", onGo);
    return () => window.removeEventListener("st-crumb-go", onGo);
  }, []);
  const txtRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const goHyper = onOpenHyperdrive ?? onOpenSpeed ?? onOpenReader;
  const goBook = onOpenBook ?? onOpenReader ?? onOpenSpeed;

  const reload = useCallback(async () => {
    const r = await fetch("/api/library", { credentials: "include" });
    if (!r.ok) return;
    const rows = (await r.json()) as ShelfItem[];
    setShelf(rows);
    setSel((cur) => {
      if (cur != null && rows.some((x) => x.text_id === cur)) return cur;
      return rows[0]?.text_id ?? null;
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = shelf.find((x) => x.text_id === sel) ?? null;

  const remember = (it: ShelfItem, mode: string) => {
    jump(it.text_id, it.sentence_id);
    void fetch(`/api/library/${it.text_id}/position`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence_id: it.sentence_id, mode }),
    });
  };

  const openHyperdrive = (it: ShelfItem) => {
    remember(it, "hyperdrive");
    goHyper?.();
  };

  const openBook = (it: ShelfItem) => {
    remember(it, "book");
    goBook?.();
  };

  const openType = async (it: ShelfItem) => {
    if (it.print_allowed === false || it.bilingual) {
      setMsg(t("lib_type_blocked"));
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const err = await sendTextToBridge({ textId: it.text_id, title: it.title, lang: it.lang });
      if (err) {
        setMsg(err);
        return;
      }
      remember(it, "bridge");
      onOpenBridge?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addToShelf = async (textId: number) => {
    await fetch("/api/library/shelf", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: textId }),
    });
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.(txt|pdf|epub|fb2|html?)$/i, ""));
      fd.append("lang", "en");
      const r = await fetch("/api/texts/upload", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const doc = (await r.json()) as { id: number; title?: string };
      await addToShelf(doc.id);
      setMsg(`${t("library_ok")}: ${doc.title || file.name}`);
      await reload();
      setSel(doc.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const savePaste = async () => {
    const text = pasteBody.trim();
    if (!text) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/texts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pasteTitle.trim() || t("lib_paste_untitled"),
          lang: "en",
          content: text,
        }),
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const doc = (await r.json()) as { id: number; title?: string };
      await addToShelf(doc.id);
      setPasteOpen(false);
      setPasteTitle("");
      setPasteBody("");
      setMsg(`${t("library_ok")}: ${doc.title}`);
      await reload();
      setSel(doc.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openPaste = async () => {
    setPasteOpen(true);
    setPasteTitle("");
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setPasteBody(clip);
    } catch {
      setPasteBody("");
    }
  };

  const openRename = (it: ShelfItem) => {
    setRenameTitle(it.title || "");
    setRenameAuthor(it.author || "");
    setRenameOpen(true);
  };

  const saveRename = async () => {
    if (sel == null) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/library/${sel}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameTitle, author: renameAuthor }),
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      setRenameOpen(false);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (it: ShelfItem) => {
    const title = it.title || `#${it.text_id}`;
    const ok = window.confirm(t("lib_delete_confirm").replace("{0}", title));
    if (!ok) return;
    setBusy(true);
    setMsg(`${t("lib_deleting")}: «${title}»…`);
    try {
      const r = await fetch(`/api/library/${it.text_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      setSel(null);
      await reload();
      setMsg(`${t("lib_deleted")}: «${title}»`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImported = (info: { text_id: number; title: string }) => {
    setMsg(`${t("library_ok")}: ${info.title}`);
    void reload().then(() => setSel(info.text_id));
    jump(info.text_id, 0);
  };

  const printAllowed = selected ? selected.print_allowed !== false && !selected.bilingual : false;
  const biBadges = selected ? badgesOf(selected) : [];

  return (
    <section className="lib-page">
      <input
        ref={txtRef}
        type="file"
        accept=".txt,.epub,.fb2,.html,.htm,text/plain"
        hidden
        onChange={(e) => {
          void onUpload(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!f) return;
          setPdfFile(f);
          setPdfOpen(true);
        }}
      />

      {/* ── ТЕКСТЫ НА БОРТУ ── */}
      <aside className="lib-shelf inst-panel">
        <h3 className="route-title lib-panel-title">{t("lib_texts_aboard")}</h3>

        <div className="lib-shelf-body">
          <p className="muted lib-legend">{t("lib_legend")}</p>
          <ul className="lib-list" role="listbox">
            {shelf.map((it) => {
              const on = it.text_id === sel;
              const b = badgesOf(it);
              const words = it.words || 0;
              const sub = `${it.author || "—"} · ${(it.lang || "?").toUpperCase()} · ${words ? `${fmtNum(words)} ${t("lib_words_short")}` : "—"}`;
              return (
                <li key={it.text_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`lib-row ${on ? "on" : ""}`}
                    onClick={() => setSel(it.text_id)}
                  >
                    <span className="lib-row-top">
                      <strong className="lib-row-title">{it.title || `#${it.text_id}`}</strong>
                      {b.length > 0 && (
                        <span className="lib-badges">
                          {b.map((x) => (
                            <span key={x.code} className={`lib-badge tone-${x.tone}`}>
                              {x.code}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="muted lib-row-sub">{sub}</span>
                    <span className={`lib-row-status ${it.bilingual ? "ok" : ""}`}>
                      ● {t("lib_status_original")}
                    </span>
                  </button>
                </li>
              );
            })}
            {!shelf.length && (
              <li className="muted lib-empty">{t("lib_empty")}</li>
            )}
          </ul>
        </div>

        <div className="lib-shelf-acts">
          <div className="lib-act-row">
            <button
              type="button"
              className="hud-btn amber"
              disabled={busy}
              onClick={() => {
                setBiliOpen(false);
                setGutOpen(true);
              }}
            >
              {t("lib_free")}
            </button>
            <button
              type="button"
              className="hud-btn"
              disabled={busy}
              onClick={() => {
                setBiliOpen(false);
                setGutOpen(true);
              }}
            >
              {t("lib_search")}
            </button>
          </div>
          <div className="lib-act-row">
            <button
              type="button"
              className="hud-btn ok"
              disabled={busy}
              onClick={() => {
                setGutOpen(false);
                setBiliOpen(true);
              }}
            >
              {t("lib_2lang")}
            </button>
          </div>
          <div className="lib-act-row">
            <button type="button" className="hud-btn" disabled={busy} onClick={() => txtRef.current?.click()}>
              {t("lib_open_txt")}
            </button>
            <button type="button" className="hud-btn" disabled={busy} onClick={() => pdfRef.current?.click()}>
              {t("lib_open_pdf")}
            </button>
            <button type="button" className="hud-btn" disabled={busy} onClick={() => void openPaste()}>
              {t("lib_paste")}
            </button>
          </div>
        </div>
      </aside>

      {/* ── ПАСПОРТ ТЕКСТА ── */}
      <div className="lib-passport inst-panel">
        <h3 className="route-title lib-panel-title amber">{t("lib_passport")}</h3>
        {!selected ? (
          <p className="muted lib-pick">{t("lib_pick")}</p>
        ) : (
          <>
            <div className="lib-pass-body">
              <h2 className="lib-pass-title">{selected.title || `#${selected.text_id}`}</h2>
              <p className="muted lib-pass-author">{selected.author || t("lib_author_none")}</p>

              <div className="lib-chips">
                <span className="lib-badge tone-green">{t("lib_status_original")}</span>
                <span className="lib-badge tone-cyan">{(selected.lang || "?").toUpperCase()}</span>
                {biBadges.map((x) => (
                  <span key={x.code} className={`lib-badge tone-${x.tone}`}>
                    {x.code}
                  </span>
                ))}
                {printAllowed ? (
                  <span className="lib-badge tone-muted">{t("lib_print_open")}</span>
                ) : (
                  <span className="lib-badge tone-amber">{t("lib_print_closed")}</span>
                )}
              </div>

              {selected.bilingual && (
                <p className="lib-bi-note">
                  {t("lib_bi_note")
                    .replace("{0}", (selected.lang || "EN").toUpperCase().split("-")[0] || "EN")
                    .replace("{1}", (selected.lang || "").includes("-")
                      ? (selected.lang.split("-")[1] || "RU").toUpperCase()
                      : "RU")
                    .replace("{2}", biBadges.find((b) => b.tone === "cyan")?.code || "PD")}
                </p>
              )}

              <pre className="lib-stats">
                {selected.bilingual
                  ? t("lib_stats_bi")
                      .replace("{0}", fmtNum(selected.chars || 0))
                      .replace("{1}", fmtNum(selected.words || 0))
                      .replace("{2}", fmtNum(selected.words || 0))
                      .replace("{3}", fmtNum(selected.sentence_id || 0))
                      .replace("{4}", String(Math.round(selected.progress_pct || 0)))
                  : t("lib_stats")
                      .replace("{0}", fmtNum(selected.chars || 0))
                      .replace("{1}", fmtNum(selected.words || 0))
                      .replace("{2}", fmtNum(selected.sentence_id || 0))
                      .replace("{3}", String(Math.round(selected.progress_pct || 0)))}
              </pre>
              {msg && <p className="mission-map-hint">{msg}</p>}
            </div>

            <div className="lib-pass-acts">
              <button
                type="button"
                className="hud-btn amber"
                disabled={busy}
                onClick={() => openHyperdrive(selected)}
              >
                {t("lib_hyperdrive")}
              </button>
              <button type="button" className="hud-btn ok" disabled={busy} onClick={() => openBook(selected)}>
                {t("lib_book")}
              </button>
              {printAllowed && (
                <button
                  type="button"
                  className="hud-btn"
                  disabled={busy}
                  onClick={() => void openType(selected)}
                >
                  {t("lib_type")}
                </button>
              )}
              <button type="button" className="hud-btn" disabled={busy} onClick={() => openRename(selected)}>
                {t("lib_rename")}
              </button>
              <button
                type="button"
                className="hud-btn danger lib-del"
                disabled={busy}
                onClick={() => void doDelete(selected)}
              >
                {t("lib_delete")}
              </button>
            </div>
          </>
        )}
      </div>

      <GutenbergModal open={gutOpen} onClose={() => setGutOpen(false)} onImported={onImported} />
      <GutenbergModal open={biliOpen} bilingual onClose={() => setBiliOpen(false)} onImported={onImported} />
      <PdfImportModal
        open={pdfOpen}
        file={pdfFile}
        onClose={() => {
          setPdfOpen(false);
          setPdfFile(null);
        }}
        onImported={async (info) => {
          setMsg(`${t("library_ok")}: ${info.title}`);
          await reload();
          setSel(info.text_id);
        }}
      />

      {pasteOpen && (
        <div className="gut-overlay" role="dialog" aria-modal="true" aria-label={t("lib_paste_title")}>
          <div className="lib-dlg inst-panel">
            <h3 className="route-title">{t("lib_paste_title")}</h3>
            <label className="lib-dlg-field">
              <span className="lab">{t("gut_title_field")}</span>
              <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} autoFocus />
            </label>
            <textarea
              className="lib-dlg-ta"
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
              rows={14}
            />
            <div className="lib-dlg-acts">
              <button type="button" className="hud-btn ok" disabled={busy || !pasteBody.trim()} onClick={() => void savePaste()}>
                {t("lib_save_paste")}
              </button>
              <button type="button" className="hud-btn" onClick={() => setPasteOpen(false)}>
                {t("gut_nav_back")}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && selected && (
        <div className="gut-overlay" role="dialog" aria-modal="true" aria-label={t("lib_rename")}>
          <div className="lib-dlg inst-panel lib-dlg-sm">
            <h3 className="route-title">{t("lib_rename")}</h3>
            <label className="lib-dlg-field">
              <span className="lab">{t("gut_title_field")}</span>
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} autoFocus />
            </label>
            <label className="lib-dlg-field">
              <span className="lab">{t("gut_author")}</span>
              <input value={renameAuthor} onChange={(e) => setRenameAuthor(e.target.value)} />
            </label>
            <div className="lib-dlg-acts">
              <button type="button" className="hud-btn ok" disabled={busy} onClick={() => void saveRename()}>
                {t("lib_save")}
              </button>
              <button type="button" className="hud-btn" onClick={() => setRenameOpen(false)}>
                {t("gut_nav_back")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
