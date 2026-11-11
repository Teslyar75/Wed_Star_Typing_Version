/** Зона Документы: список / редактор, autosave с rev, версии, печать браузера. */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import { createEpoch, isAbortError } from "../shell/requestEpoch";
import { observeBox } from "../shell/resizeGuard";
import {
  docsApi,
  DocsHttpError,
  pageOf,
  saveAppliesTo,
  wordCount,
  type DocListItem,
  type DocOut,
  type DocVersion,
} from "./docsApi";
import "./docs.css";

type Screen = "list" | "edit";
type SaveUi = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error" | "guest";

const ROW_H = 62;

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

  const [open, setOpen] = useState<DocOut | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rev, setRev] = useState(1);
  const [saveUi, setSaveUi] = useState<SaveUi>("idle");
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [verPage, setVerPage] = useState(0);

  const epoch = useRef(createEpoch());
  const listAc = useRef<AbortController | null>(null);
  const getAc = useRef<AbortController | null>(null);
  const timer = useRef<number>(0);
  const listBox = useRef<HTMLDivElement | null>(null);
  const openId = useRef<number | null>(null);
  const draft = useRef({ title: "", body: "", rev: 1, dirty: false });
  const blocked = useRef(false);
  const mounted = useRef(true);

  const applyDoc = (doc: DocOut, dirty = false) => {
    blocked.current = false;
    setOpen(doc);
    setTitle(doc.title);
    setBody(doc.body);
    setRev(doc.rev);
    openId.current = doc.id;
    draft.current = { title: doc.title, body: doc.body, rev: doc.rev, dirty };
    setSaveUi(dirty ? "dirty" : "saved");
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

  // Ctrl/Cmd+S — сохранить сейчас (desktop Ctrl+S); браузерный Save Page не трогаем.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      if (screen !== "edit") return;
      e.preventDefault();
      window.clearTimeout(timer.current);
      void flush();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush, screen]);

  const loadList = useCallback(async () => {
    listAc.current?.abort();
    const ac = new AbortController();
    listAc.current = ac;
    const n = epoch.current.next();
    try {
      const data = await docsApi.list(ac.signal);
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
  }, []);

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

  const createDoc = useCallback(async () => {
    try {
      const doc = await docsApi.create(t("docs_untitled"), "");
      setItems((xs) => [{ id: doc.id, title: doc.title, rev: doc.rev, words: doc.words, updated_at: doc.updated_at }, ...xs]);
      applyDoc(doc, true);
      setScreen("edit");
      setVersions([]);
    } catch (e) {
      if (e instanceof DocsHttpError && e.status === 401) setGuest(true);
    }
  }, []);

  const backToList = useCallback(async () => {
    window.clearTimeout(timer.current);
    await flush();
    epoch.current.invalidate();
    openId.current = null;
    setOpen(null);
    setScreen("list");
    void loadList();
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

  useEffect(() => {
    mounted.current = true;
    void loadList();
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
      void flush({ keepalive: true });
    };
  }, [loadList, flush]);

  useEffect(() => {
    const el = listBox.current;
    if (!el || screen !== "list") return;
    return observeBox(el, ({ h }) => setFit(Math.max(1, Math.floor(h / ROW_H))));
  }, [screen]);

  useEffect(() => {
    setZoneScreens("docs", [
      { slug: "list", label: t("docs_list") },
      { slug: "edit", label: t("docs_editor") },
    ]);
    setDeepRoute([{ slug: screen, label: t(screen === "edit" ? "docs_editor" : "docs_list") }]);
  }, [screen]);

  useEffect(() => {
    registerGoHandler((slugs) => {
      const s = slugs[0];
      if (s === "list") void backToList();
      if (s === "edit" && openId.current != null) setScreen("edit");
    });
    return () => registerGoHandler(null);
  }, [backToList]);

  const onTitle = (v: string) => {
    setTitle(v);
    draft.current = { ...draft.current, title: v, dirty: true };
    if (blocked.current) {
      setSaveUi("conflict");
      return;
    }
    setSaveUi("dirty");
    schedule();
  };
  const onBody = (v: string) => {
    setBody(v);
    draft.current = { ...draft.current, body: v, dirty: true };
    if (blocked.current) {
      setSaveUi("conflict");
      return;
    }
    setSaveUi("dirty");
    schedule();
  };

  const listed = pageOf(items, page, fit);
  const verFit = 2;
  const versPage = pageOf(versions, verPage, verFit);
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

  return (
    <section className="docs-panel" data-testid="docs-panel" data-docs-screen={screen}>
      <div className="docs-print-sheet" data-testid="docs-print-sheet" aria-hidden>
        <h1>{title || t("docs_untitled")}</h1>
        <div>{body}</div>
      </div>

      {screen === "list" ? (
        <>
          <div className="docs-toolbar">
            <button type="button" className="btn" data-testid="docs-new" disabled={guest} onClick={() => void createDoc()}>
              {t("docs_new")}
            </button>
            <span className={`docs-status ${guest ? "err" : ""}`} data-testid="docs-status">
              {guest ? t("docs_need_crew") : listErr}
            </span>
          </div>
          <div className="docs-list" ref={listBox} data-testid="docs-list">
            {guest ? (
              <div className="docs-empty">{t("docs_need_crew")}</div>
            ) : items.length === 0 ? (
              <div className="docs-empty">{t("docs_empty")}</div>
            ) : (
              listed.rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className="docs-row"
                  data-testid="docs-row"
                  data-doc-id={row.id}
                  onClick={() => void openDoc(row.id)}
                >
                  <span className="docs-row-title">{row.title || t("docs_untitled")}</span>
                  <span className="docs-row-meta">
                    {t("docs_words")} {row.words}
                  </span>
                </button>
              ))
            )}
          </div>
          {items.length > fit ? <Pager page={listed.page} pages={listed.pages} onPage={setPage} /> : null}
        </>
      ) : (
        <div className="docs-editor" data-testid="docs-editor" data-doc-id={open?.id ?? ""} data-rev={rev}>
          <div className="docs-toolbar">
            <button type="button" className="btn ghost" data-testid="docs-back" onClick={() => void backToList()}>
              {t("docs_back")}
            </button>
            <button
              type="button"
              className="btn ghost"
              data-testid="docs-print"
              onClick={() => window.print()}
            >
              {t("docs_print")}
            </button>
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
          <input
            className="docs-title-input"
            data-testid="docs-title"
            value={title}
            aria-label={t("docs_title")}
            onChange={(e) => onTitle(e.target.value)}
          />
          <textarea
            className="docs-body-input"
            data-testid="docs-body"
            value={body}
            aria-label={t("docs_body")}
            onChange={(e) => onBody(e.target.value)}
          />
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
              {versions.length > verFit ? (
                <Pager page={versPage.page} pages={versPage.pages} onPage={setVerPage} />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
