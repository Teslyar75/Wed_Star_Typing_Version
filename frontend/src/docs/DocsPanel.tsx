/** Зона Документы: список / корзина / редактор, autosave, Markdown-лента, экспорт/импорт. */
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { t, getLang } from "../i18n";
import { speakUtterance, stopSpeaking } from "../english/speak";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import { createEpoch, isAbortError } from "../shell/requestEpoch";
import { observeBox } from "../shell/resizeGuard";
import {
  docsApi,
  DocsHttpError,
  filterItems,
  pageOf,
  saveAppliesTo,
  sortItems,
  wordCount,
  type DocListItem,
  type DocOut,
  type DocSort,
  type DocTemplate,
  type DocVersion,
  type ExportFmt,
} from "./docsApi";
import {
  applyFormat,
  DocUndoStack,
  findNext,
  htmlToMd,
  replaceAll,
  type FormatId,
  type Sel,
} from "./docsFormat";
import { mdToHtml, mdToPlain } from "./docsMd";
import "./docs.css";

type Screen = "list" | "trash" | "edit";
type SaveUi = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error" | "guest";
type EditMode = "source" | "preview";

const ROW_H = 62;
const FORMAT_MAIN: FormatId[] = ["b", "i", "u", "h1", "h2", "li", "ol", "task", "quote"];
const FORMAT_MORE: FormatId[] = ["hl", "code", "link", "table"];
const EXPORTS: ExportFmt[] = ["txt", "md", "html", "docx", "stdoc", "pdf"];

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <div className="docs-pager" data-testid="docs-pager">
      <button type="button" className="btn ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span>
        {page + 1}/{pages}
      </span>
      <button type="button" className="btn ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </div>
  );
}

export default function DocsPanel() {
  const [screen, setScreen] = useState<Screen>("list");
  const [items, setItems] = useState<DocListItem[]>([]);
  const [guest, setGuest] = useState(false);
  const [listErr, setListErr] = useState("");
  const [page, setPage] = useState(0);
  const [fit, setFit] = useState(4);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DocSort>("updated");
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [tplOpen, setTplOpen] = useState(false);

  const [open, setOpen] = useState<DocOut | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rev, setRev] = useState(1);
  const [saveUi, setSaveUi] = useState<SaveUi>("idle");
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [verPage, setVerPage] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>("source");
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [replQ, setReplQ] = useState("");
  const [moreFmt, setMoreFmt] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const epoch = useRef(createEpoch());
  const listAc = useRef<AbortController | null>(null);
  const getAc = useRef<AbortController | null>(null);
  const timer = useRef<number>(0);
  const listBox = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);
  const openId = useRef<number | null>(null);
  const draft = useRef({ title: "", body: "", rev: 1, dirty: false });
  const blocked = useRef(false);
  const mounted = useRef(true);
  const undo = useRef(new DocUndoStack());
  const selRef = useRef<Sel>({ start: 0, end: 0 });

  const applyDoc = (doc: DocOut, dirty = false) => {
    blocked.current = false;
    setOpen(doc);
    setTitle(doc.title);
    setBody(doc.body);
    setRev(doc.rev);
    openId.current = doc.id;
    draft.current = { title: doc.title, body: doc.body, rev: doc.rev, dirty };
    undo.current.reset({ title: doc.title, body: doc.body });
    setSaveUi(dirty ? "dirty" : "saved");
    setEditMode("source");
  };

  const flush = useCallback(async (opts?: { keepalive?: boolean; id?: number }) => {
    const id = opts?.id ?? openId.current;
    const d = draft.current;
    if (id == null || !d.dirty) return;
    const snap = { ...d, id };
    if (!opts?.keepalive) setSaveUi("saving");
    try {
      const saved = await docsApi.save(id, snap.title, snap.body, snap.rev, {
        keepalive: opts?.keepalive,
      });
      if (!mounted.current) return;
      if (!saveAppliesTo(openId.current, saved.id)) return;
      if (draft.current.title === snap.title && draft.current.body === snap.body) {
        draft.current = { title: saved.title, body: saved.body, rev: saved.rev, dirty: false };
        setRev(saved.rev);
        setOpen(saved);
        setSaveUi("saved");
      } else {
        draft.current = { ...draft.current, rev: saved.rev };
        setRev(saved.rev);
        setSaveUi("dirty");
      }
    } catch (e) {
      if (!mounted.current) return;
      if (!saveAppliesTo(openId.current, snap.id)) return;
      if (e instanceof DocsHttpError && e.status === 409) {
        blocked.current = true;
        setSaveUi("conflict");
        return;
      }
      if (e instanceof DocsHttpError && e.status === 401) {
        setGuest(true);
        setSaveUi("guest");
        return;
      }
      setSaveUi("error");
    }
  }, []);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flush();
    }, 700);
  }, [flush]);

  const markDirty = (nextTitle: string, nextBody: string) => {
    const before = { title: draft.current.title, body: draft.current.body };
    const after = { title: nextTitle, body: nextBody };
    undo.current.pushBefore(before, after);
    draft.current = { ...draft.current, title: nextTitle, body: nextBody, dirty: true };
    if (blocked.current) {
      setSaveUi("conflict");
      return;
    }
    setSaveUi("dirty");
    schedule();
  };

  const loadList = useCallback(
    async (opts?: { trash?: boolean }) => {
      const trash = opts?.trash ?? screen === "trash";
      listAc.current?.abort();
      const ac = new AbortController();
      listAc.current = ac;
      const n = epoch.current.next();
      try {
        const data = await docsApi.list({ trash, sort, signal: ac.signal });
        if (!epoch.current.is(n)) return;
        setGuest(false);
        setListErr("");
        setItems(data.items);
      } catch (e) {
        if (!epoch.current.is(n) || isAbortError(e)) return;
        if (e instanceof DocsHttpError && e.status === 401) {
          setGuest(true);
          setItems([]);
          return;
        }
        setListErr(e instanceof Error ? e.message : "err");
      }
    },
    [screen, sort],
  );

  const openDoc = useCallback(
    async (id: number) => {
      await flush({ id: openId.current ?? undefined });
      epoch.current.next();
      getAc.current?.abort();
      const ac = new AbortController();
      getAc.current = ac;
      const n = epoch.current.next();
      try {
        const doc = await docsApi.get(id, ac.signal);
        if (!epoch.current.is(n)) return;
        applyDoc(doc);
        setScreen("edit");
        const vers = await docsApi.versions(id, ac.signal);
        if (!epoch.current.is(n)) return;
        setVersions(vers.items);
        setVerPage(0);
      } catch (e) {
        if (!epoch.current.is(n) || isAbortError(e)) return;
        if (e instanceof DocsHttpError && e.status === 401) {
          setGuest(true);
          setScreen("list");
        }
      }
    },
    [flush],
  );

  const createDoc = useCallback(
    async (tpl?: DocTemplate) => {
      try {
        const doc = await docsApi.create(tpl?.title || t("docs_untitled"), tpl?.body || "");
        setItems((xs) => [
          { id: doc.id, title: doc.title, rev: doc.rev, words: doc.words, updated_at: doc.updated_at, created_at: doc.created_at },
          ...xs,
        ]);
        applyDoc(doc, true);
        setScreen("edit");
        setVersions([]);
        setTplOpen(false);
      } catch (e) {
        if (e instanceof DocsHttpError && e.status === 401) setGuest(true);
      }
    },
    [],
  );

  const backToList = useCallback(async () => {
    window.clearTimeout(timer.current);
    await flush();
    stopSpeaking();
    setSpeaking(false);
    epoch.current.invalidate();
    openId.current = null;
    setOpen(null);
    setScreen("list");
    void loadList({ trash: false });
  }, [flush, loadList]);

  const reloadServer = useCallback(async () => {
    if (openId.current == null) return;
    const id = openId.current;
    try {
      const doc = await docsApi.get(id);
      if (!saveAppliesTo(openId.current, doc.id)) return;
      applyDoc(doc);
      const vers = await docsApi.versions(id);
      if (!saveAppliesTo(openId.current, id)) return;
      setVersions(vers.items);
    } catch {
      setSaveUi("error");
    }
  }, []);

  const restore = useCallback(
    async (version_id: number) => {
      if (openId.current == null) return;
      window.clearTimeout(timer.current);
      await flush();
      const id = openId.current;
      try {
        const doc = await docsApi.restore(id, version_id);
        if (!saveAppliesTo(openId.current, doc.id)) return;
        applyDoc(doc);
        const vers = await docsApi.versions(id);
        if (!saveAppliesTo(openId.current, id)) return;
        setVersions(vers.items);
      } catch {
        setSaveUi("error");
      }
    },
    [flush],
  );

  const moveToTrash = useCallback(
    async (id: number) => {
      try {
        await docsApi.trash(id);
        setItems((xs) => xs.filter((x) => x.id !== id));
        if (openId.current === id) {
          openId.current = null;
          setOpen(null);
          setScreen("list");
        }
      } catch {
        setListErr(t("docs_save_err"));
      }
    },
    [],
  );

  const restoreFromTrash = useCallback(async (id: number) => {
    try {
      await docsApi.restoreTrash(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch {
      setListErr(t("docs_save_err"));
    }
  }, []);

  const purgeDoc = useCallback(async (id: number) => {
    try {
      await docsApi.purge(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch {
      setListErr(t("docs_save_err"));
    }
  }, []);

  const doExport = useCallback(
    async (fmt: ExportFmt) => {
      if (openId.current == null) return;
      await flush();
      setExportOpen(false);
      if (fmt === "pdf") {
        window.print();
        return;
      }
      try {
        const r = await fetch(docsApi.exportUrl(openId.current, fmt), { credentials: "include" });
        if (!r.ok) throw new Error("export");
        const blob = await r.blob();
        const cd = r.headers.get("Content-Disposition") || "";
        const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
        const name = decodeURIComponent(m?.[1] || m?.[2] || `doc.${fmt}`);
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      } catch {
        setSaveUi("error");
      }
    },
    [flush],
  );

  const onImport = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const doc = await docsApi.importFile(file);
      setItems((xs) => [
        { id: doc.id, title: doc.title, rev: doc.rev, words: doc.words, updated_at: doc.updated_at, created_at: doc.created_at },
        ...xs,
      ]);
      applyDoc(doc);
      setScreen("edit");
      setVersions([]);
    } catch (e) {
      if (e instanceof DocsHttpError && e.status === 401) setGuest(true);
      else setListErr(t("docs_import_err"));
    }
  }, []);

  const rememberSel = () => {
    const el = bodyRef.current;
    if (!el) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const applyFmt = (id: FormatId) => {
    rememberSel();
    const headers: [string, string, string] = [t("docs_tpl_what"), t("docs_tpl_howmany"), t("docs_tpl_note")];
    const r = applyFormat(id, body, selRef.current, headers);
    setBody(r.body);
    markDirty(title, r.body);
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.sel.start, r.sel.end);
      selRef.current = r.sel;
    });
  };

  const runUndo = () => {
    const prev = undo.current.doUndo({ title, body });
    if (!prev) return;
    setTitle(prev.title);
    setBody(prev.body);
    draft.current = { ...draft.current, title: prev.title, body: prev.body, dirty: true };
    setSaveUi("dirty");
    schedule();
  };

  const runRedo = () => {
    const next = undo.current.doRedo({ title, body });
    if (!next) return;
    setTitle(next.title);
    setBody(next.body);
    draft.current = { ...draft.current, title: next.title, body: next.body, dirty: true };
    setSaveUi("dirty");
    schedule();
  };

  const insertImage = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 900;
        let w = img.width;
        let h = img.height;
        if (w > max) {
          h = Math.round((h * max) / w);
          w = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("img"));
      };
      img.src = url;
    });
    rememberSel();
    const snip = `\n<img src="${dataUrl}" width="400">\n`;
    const { start, end } = selRef.current;
    const next = body.slice(0, start) + snip + body.slice(end);
    setBody(next);
    markDirty(title, next);
  };

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const text = mdToPlain(`${title}\n\n${body}`).slice(0, 4000);
    if (!text.trim()) return;
    setSpeaking(true);
    speakUtterance({
      text,
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  useEffect(() => {
    mounted.current = true;
    void loadList({ trash: false });
    void docsApi.templates(getLang()).then((r) => setTemplates(r.items)).catch(() => setTemplates([]));
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush({ keepalive: true });
      if (document.visibilityState === "visible") void loadList();
    };
    const onOff = () => void flush({ keepalive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onOff);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      listAc.current?.abort();
      getAc.current?.abort();
      epoch.current.invalidate();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onOff);
      stopSpeaking();
      void flush({ keepalive: true });
    };
  }, [loadList, flush]);

  useEffect(() => {
    if (screen === "list" || screen === "trash") void loadList({ trash: screen === "trash" });
  }, [sort, screen, loadList]);

  useEffect(() => {
    const el = listBox.current;
    if (!el || (screen !== "list" && screen !== "trash")) return;
    return observeBox(el, ({ h }) => setFit(Math.max(1, Math.floor(h / ROW_H))));
  }, [screen]);

  useEffect(() => {
    setZoneScreens("docs", [
      { slug: "list", label: t("docs_list") },
      { slug: "trash", label: t("docs_trash") },
      { slug: "edit", label: t("docs_editor") },
    ]);
    const label =
      screen === "edit" ? t("docs_editor") : screen === "trash" ? t("docs_trash") : t("docs_list");
    setDeepRoute([{ slug: screen, label }]);
  }, [screen]);

  useEffect(() => {
    registerGoHandler((slugs) => {
      const s = slugs[0];
      if (s === "list") void backToList();
      if (s === "trash") {
        void flush().then(() => {
          openId.current = null;
          setOpen(null);
          setScreen("trash");
        });
      }
      if (s === "edit" && openId.current != null) setScreen("edit");
    });
    return () => registerGoHandler(null);
  }, [backToList, flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s" && screen === "edit") {
        e.preventDefault();
        window.clearTimeout(timer.current);
        void flush();
        return;
      }
      if (screen !== "edit") return;
      if (k === "b") {
        e.preventDefault();
        applyFmt("b");
      } else if (k === "i") {
        e.preventDefault();
        applyFmt("i");
      } else if (k === "u") {
        e.preventDefault();
        applyFmt("u");
      } else if (k === "e") {
        e.preventDefault();
        applyFmt("code");
      } else if (k === "k") {
        e.preventDefault();
        applyFmt("link");
      } else if (k === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if (k === "h") {
        e.preventDefault();
        setFindOpen(true);
      } else if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        runRedo();
      } else if (k === "m" && e.shiftKey) {
        e.preventDefault();
        setEditMode((m) => (m === "source" ? "preview" : "source"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, title, body, flush]);

  const onTitle = (v: string) => {
    setTitle(v);
    markDirty(v, body);
  };
  const onBody = (v: string) => {
    setBody(v);
    markDirty(title, v);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Shift+V / plain: нет text/html — оставляем браузерный paste.
    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const md = htmlToMd(html);
    rememberSel();
    const { start, end } = selRef.current;
    const next = body.slice(0, start) + md + body.slice(end);
    setBody(next);
    markDirty(title, next);
  };

  const filtered = useMemo(() => sortItems(filterItems(items, query), sort), [items, query, sort]);
  const listed = pageOf(filtered, page, fit);
  const verFit = 2;
  const versPage = pageOf(versions, verPage, verFit);
  const previewHtml = useMemo(() => mdToHtml(title, body), [title, body]);
  const statusLabel =
    guest || saveUi === "guest"
      ? t("docs_need_crew")
      : saveUi === "saving"
        ? t("docs_saving")
        : saveUi === "saved"
          ? t("docs_saved")
          : saveUi === "conflict"
            ? t("docs_conflict")
            : saveUi === "error"
              ? t("docs_save_err")
              : saveUi === "dirty"
                ? t("docs_saving")
                : "";

  const fmtLabel = (id: FormatId) => t(`docs_fmt_${id}` as "docs_fmt_b");

  return (
    <section className="docs-panel" data-testid="docs-panel" data-docs-screen={screen}>
      <div
        className="docs-print-sheet"
        data-testid="docs-print-sheet"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />

      {screen === "list" || screen === "trash" ? (
        <>
          <div className="docs-toolbar">
            {screen === "list" ? (
              <>
                <div className="docs-new-wrap">
                  <button type="button" className="btn" data-testid="docs-new" disabled={guest} onClick={() => void createDoc()}>
                    {t("docs_new")}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    data-testid="docs-templates"
                    disabled={guest}
                    aria-expanded={tplOpen}
                    onClick={() => setTplOpen((v) => !v)}
                  >
                    ▾
                  </button>
                  {tplOpen ? (
                    <div className="docs-menu" data-testid="docs-templates-menu">
                      {templates.map((tpl) => (
                        <button key={tpl.id} type="button" className="docs-menu-item" onClick={() => void createDoc(tpl)}>
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="btn ghost" data-testid="docs-import" disabled={guest} onClick={() => fileRef.current?.click()}>
                  {t("docs_import")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.markdown,.docx,.stdoc"
                  hidden
                  data-testid="docs-import-input"
                  onChange={(e) => void onImport(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn ghost"
                  data-testid="docs-goto-trash"
                  disabled={guest}
                  onClick={() => {
                    setScreen("trash");
                    setPage(0);
                    setQuery("");
                  }}
                >
                  {t("docs_trash")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn ghost"
                data-testid="docs-back-list"
                onClick={() => {
                  setScreen("list");
                  setPage(0);
                }}
              >
                {t("docs_back")}
              </button>
            )}
            <input
              className="docs-search"
              data-testid="docs-search"
              value={query}
              placeholder={t("docs_search")}
              aria-label={t("docs_search")}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <select
              className="docs-sort"
              data-testid="docs-sort"
              value={sort}
              aria-label={t("docs_sort")}
              onChange={(e) => setSort(e.target.value as DocSort)}
            >
              <option value="updated">{t("docs_sort_updated")}</option>
              <option value="created">{t("docs_sort_created")}</option>
              <option value="title">{t("docs_sort_title")}</option>
            </select>
            <span className={`docs-status ${guest ? "err" : ""}`} data-testid="docs-status">
              {guest ? t("docs_need_crew") : listErr}
            </span>
          </div>
          <div className="docs-list" ref={listBox} data-testid="docs-list">
            {guest ? (
              <div className="docs-empty">{t("docs_need_crew")}</div>
            ) : filtered.length === 0 ? (
              <div className="docs-empty">{screen === "trash" ? t("docs_trash_empty") : t("docs_empty")}</div>
            ) : (
              listed.rows.map((row) => (
                <div key={row.id} className="docs-row-wrap" data-testid="docs-row" data-doc-id={row.id}>
                  <button type="button" className="docs-row" disabled={screen === "trash"} onClick={() => void openDoc(row.id)}>
                    <span className="docs-row-title">{row.title || t("docs_untitled")}</span>
                    <span className="docs-row-meta">
                      {t("docs_words")} {row.words}
                    </span>
                  </button>
                  {screen === "list" ? (
                    <button
                      type="button"
                      className="btn ghost docs-row-action"
                      data-testid="docs-trash-one"
                      aria-label={t("docs_trash")}
                      onClick={() => void moveToTrash(row.id)}
                    >
                      🗑
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn ghost docs-row-action" data-testid="docs-restore-trash" onClick={() => void restoreFromTrash(row.id)}>
                        {t("docs_restore_trash")}
                      </button>
                      <button type="button" className="btn ghost docs-row-action" data-testid="docs-purge" onClick={() => void purgeDoc(row.id)}>
                        {t("docs_purge")}
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          {filtered.length > fit ? <Pager page={listed.page} pages={listed.pages} onPage={setPage} /> : null}
        </>
      ) : (
        <div className="docs-editor" data-testid="docs-editor" data-doc-id={open?.id ?? ""} data-rev={rev} data-mode={editMode}>
          <div className="docs-toolbar">
            <button type="button" className="btn ghost" data-testid="docs-back" onClick={() => void backToList()}>
              {t("docs_back")}
            </button>
            <button type="button" className="btn ghost" data-testid="docs-save-now" onClick={() => void flush()}>
              {t("docs_save_now")}
            </button>
            <button type="button" className="btn ghost" data-testid="docs-print" onClick={() => window.print()}>
              {t("docs_print")}
            </button>
            <div className="docs-new-wrap">
              <button type="button" className="btn ghost" data-testid="docs-export" onClick={() => setExportOpen((v) => !v)}>
                {t("docs_export")}
              </button>
              {exportOpen ? (
                <div className="docs-menu" data-testid="docs-export-menu">
                  {EXPORTS.map((fmt) => (
                    <button key={fmt} type="button" className="docs-menu-item" data-testid={`docs-export-${fmt}`} onClick={() => void doExport(fmt)}>
                      {fmt.toUpperCase()}
                      {fmt === "pdf" ? ` (${t("docs_pdf_via_print")})` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={"btn ghost" + (editMode === "preview" ? " docs-on" : "")}
              data-testid="docs-visual"
              onClick={() => setEditMode((m) => (m === "source" ? "preview" : "source"))}
            >
              {t("docs_visual")}
            </button>
            <button type="button" className="btn ghost" data-testid="docs-find-toggle" onClick={() => setFindOpen((v) => !v)}>
              {t("docs_find")}
            </button>
            <button type="button" className={"btn ghost" + (speaking ? " docs-on" : "")} data-testid="docs-speak" onClick={toggleSpeak}>
              {t("docs_speak")}
            </button>
            <button type="button" className="btn ghost" data-testid="docs-image" onClick={() => imgRef.current?.click()}>
              {t("docs_image")}
            </button>
            <input ref={imgRef} type="file" accept="image/*" hidden data-testid="docs-image-input" onChange={(e) => void insertImage(e.target.files?.[0] ?? null)} />
            {openId.current != null ? (
              <button type="button" className="btn ghost" data-testid="docs-trash-open" onClick={() => void moveToTrash(openId.current!)}>
                {t("docs_trash")}
              </button>
            ) : null}
            {saveUi === "conflict" ? (
              <button type="button" className="btn" data-testid="docs-reload" onClick={() => void reloadServer()}>
                {t("docs_reload")}
              </button>
            ) : null}
            <span className={`docs-status ${saveUi === "saved" ? "ok" : saveUi === "conflict" || saveUi === "error" ? "err" : ""}`} data-testid="docs-status">
              {statusLabel}
            </span>
            <span className="docs-row-meta">
              {t("docs_words")} {wordCount(body)}
            </span>
          </div>

          <div className="docs-fmtbar" data-testid="docs-fmtbar">
            <button type="button" className="btn ghost docs-fmt" data-testid="docs-undo" onClick={runUndo} title={t("docs_fmt_undo")}>
              ↶
            </button>
            <button type="button" className="btn ghost docs-fmt" data-testid="docs-redo" onClick={runRedo} title={t("docs_fmt_redo")}>
              ↷
            </button>
            {FORMAT_MAIN.map((id) => (
              <button key={id} type="button" className="btn ghost docs-fmt" data-testid={`docs-fmt-${id}`} title={fmtLabel(id)} onClick={() => applyFmt(id)}>
                {id === "li" ? "•" : id === "ol" ? "1." : id === "task" ? "☐" : id === "quote" ? "❝" : id.toUpperCase()}
              </button>
            ))}
            <button type="button" className="btn ghost docs-fmt" data-testid="docs-fmt-more" onClick={() => setMoreFmt((v) => !v)}>
              ⋯
            </button>
            {moreFmt
              ? FORMAT_MORE.map((id) => (
                  <button key={id} type="button" className="btn ghost docs-fmt" data-testid={`docs-fmt-${id}`} title={fmtLabel(id)} onClick={() => applyFmt(id)}>
                    {id === "hl" ? "==" : id === "code" ? "</>" : id === "link" ? "🔗" : "▦"}
                  </button>
                ))
              : null}
          </div>

          {findOpen ? (
            <div className="docs-find" data-testid="docs-find">
              <input data-testid="docs-find-q" value={findQ} placeholder={t("docs_find")} onChange={(e) => setFindQ(e.target.value)} />
              <input data-testid="docs-repl-q" value={replQ} placeholder={t("docs_replace")} onChange={(e) => setReplQ(e.target.value)} />
              <button
                type="button"
                className="btn ghost"
                data-testid="docs-find-next"
                onClick={() => {
                  const from = Math.max(selRef.current.end, bodyRef.current?.selectionEnd ?? 0);
                  let at = findNext(body, findQ, from);
                  if (at < 0) at = findNext(body, findQ, 0);
                  if (at < 0 || !bodyRef.current) return;
                  bodyRef.current.focus();
                  bodyRef.current.setSelectionRange(at, at + findQ.length);
                  selRef.current = { start: at, end: at + findQ.length };
                }}
              >
                {t("docs_find_next")}
              </button>
              <button
                type="button"
                className="btn ghost"
                data-testid="docs-replace-one"
                onClick={() => {
                  const el = bodyRef.current;
                  if (!el || !findQ) return;
                  const { start, end } = { start: el.selectionStart, end: el.selectionEnd };
                  const selected = body.slice(start, end);
                  if (selected.toLowerCase() === findQ.toLowerCase()) {
                    const next = body.slice(0, start) + replQ + body.slice(end);
                    setBody(next);
                    markDirty(title, next);
                  }
                }}
              >
                {t("docs_replace")}
              </button>
              <button
                type="button"
                className="btn ghost"
                data-testid="docs-replace-all"
                onClick={() => {
                  const r = replaceAll(body, findQ, replQ);
                  setBody(r.body);
                  markDirty(title, r.body);
                }}
              >
                {t("docs_replace_all")}
              </button>
            </div>
          ) : null}

          <input
            className="docs-title-input"
            data-testid="docs-title"
            value={title}
            aria-label={t("docs_title")}
            onChange={(e) => onTitle(e.target.value)}
          />
          {editMode === "source" ? (
            <textarea
              ref={bodyRef}
              className="docs-body-input"
              data-testid="docs-body"
              value={body}
              aria-label={t("docs_body")}
              onChange={(e) => onBody(e.target.value)}
              onSelect={rememberSel}
              onClick={rememberSel}
              onKeyUp={rememberSel}
              onPaste={onPaste}
            />
          ) : (
            <div className="docs-preview" data-testid="docs-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
          {versions.length ? (
            <div className="docs-versions" data-testid="docs-versions">
              {versPage.rows.map((v) => (
                <div key={v.id} className="docs-ver">
                  <span>
                    r{v.rev} · {v.title || t("docs_untitled")} · {t("docs_words")} {v.words}
                  </span>
                  <button type="button" className="btn ghost" data-testid="docs-restore" onClick={() => void restore(v.id)}>
                    {t("docs_restore")}
                  </button>
                </div>
              ))}
              {versions.length > verFit ? <Pager page={versPage.page} pages={versPage.pages} onPage={setVerPage} /> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
