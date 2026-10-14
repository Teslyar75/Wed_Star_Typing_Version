/** Свободные книги · порт stamina/book_shelf.BookCatalogPanel (+ bilingual / адаптив). */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { setModalStack } from "../shell/routeStore";
import BilingualManualModal from "./BilingualManualModal";

const LANGS_GUT = ["", "en", "de", "fr", "es", "it", "ru"] as const;
const LANGS_ORIG = ["en", "de", "fr", "es", "it", "ru"] as const;
const LANGS_TR = ["ru", "uk", "de", "fr", "es", "it"] as const;
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
/** Сколько карточек на вкладку — только полностью видимые (обложка+название). */
const LIST_PAGE = 4;

export type CatalogHit = {
  id: number | string;
  title: string;
  authors: string;
  languages: string[];
  cover_url?: string | null;
  has_cover?: boolean;
  download_count?: number;
  cefr?: string | null;
  slug?: string;
  lang_a?: string;
  lang_b?: string;
  source?: string;
  tr_id?: number;
  translation?: { id: number; title?: string; authors?: string; languages?: string[] };
  bilingual?: boolean;
};

type Mode = "browse" | "search" | "cefr";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (info: { text_id: number; title: string }) => void;
  bilingual?: boolean;
};

function isBilinguisPair(langA: string, langB: string): boolean {
  const a = langA.toLowerCase();
  const b = langB.toLowerCase();
  return a !== b && ((a === "en" && (b === "ru" || b === "uk")) || (b === "en" && (a === "ru" || a === "uk")));
}

function sameId(a: number | string | null, b: number | string | null): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export default function GutenbergModal({ open, onClose, onImported, bilingual = false }: Props) {
  const [titleQ, setTitleQ] = useState("");
  const [authorQ, setAuthorQ] = useState("");
  const [lang, setLang] = useState<string>("en");
  const [langB, setLangB] = useState<string>("ru");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [sel, setSel] = useState<number | string | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>("browse");
  const [cefr, setCefr] = useState<string | null>(null);
  const [cefrOpen, setCefrOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const root = bilingual
      ? { slug: "bilingual", label: t("gut_title_2lang") }
      : { slug: "gutenberg", label: t("gut_free_books") };
    const segs = [root];
    if (manualOpen) segs.push({ slug: "manual", label: t("bi_manual_title") });
    setModalStack(segs);
    return () => setModalStack([]);
  }, [open, bilingual, manualOpen]);

  useEffect(() => {
    if (!open) return;
    const onGo = (e: Event) => {
      const slugs = ((e as CustomEvent<{ slugs: string[] }>).detail?.slugs || []) as string[];
      if (!slugs.includes("manual")) setManualOpen(false);
      const root = bilingual ? "bilingual" : "gutenberg";
      if (!slugs.includes(root)) onClose();
    };
    window.addEventListener("st-crumb-go", onGo);
    return () => window.removeEventListener("st-crumb-go", onGo);
  }, [open, bilingual, onClose]);
  const fetchSeq = useRef(0);
  const modeRef = useRef<Mode>("browse");
  const cefrRef = useRef<string | null>(null);
  modeRef.current = mode;
  cefrRef.current = cefr;

  const pairBilinguis = bilingual && isBilinguisPair(lang || "en", langB);

  const beginFetch = useCallback((clearList: boolean) => {
    const seq = ++fetchSeq.current;
    setBusy(true);
    setMsg(t("gut_loading"));
    if (clearList) {
      setHits([]);
      setSel(null);
      setListPage(0);
      setHasMore(false);
      setCatalogCount(0);
    }
    return seq;
  }, []);

  const isStale = (seq: number) => seq !== fetchSeq.current;

  const applyHits = (
    seq: number,
    next: CatalogHit[],
    opts: { mode: Mode; page: number; append?: boolean; count?: number; more?: boolean; cefrLv?: string | null },
  ) => {
    if (isStale(seq)) return;
    setHits((prev) => {
      const merged = opts.append ? [...prev, ...next] : next;
      if (opts.append) {
        setListPage(
          Math.max(0, Math.floor(merged.length / LIST_PAGE) - (merged.length % LIST_PAGE === 0 ? 1 : 0)),
        );
      } else {
        setListPage(0);
      }
      return merged;
    });
    setPage(opts.page);
    setMode(opts.mode);
    modeRef.current = opts.mode;
    if (opts.mode === "cefr") {
      const lv = (opts.cefrLv || cefr || "A1").toUpperCase();
      setCefr(lv);
      cefrRef.current = lv;
    } else if (!opts.append) {
      setCefr(null);
      cefrRef.current = null;
    }
    setCatalogCount(opts.count ?? next.length);
    setHasMore(Boolean(opts.more));
    if (!opts.append) setSel(next[0]?.id ?? null);
    setMsg(next.length ? "" : t("gut_empty"));
    setBusy(false);
  };

  const loadBilinguis = useCallback(
    async (opts?: { search?: boolean }) => {
      const seq = beginFetch(true);
      try {
        const la = lang || "en";
        const lb = langB || "ru";
        const r = await fetch(
          `/api/catalog/bilinguis/list?lang_a=${encodeURIComponent(la)}&lang_b=${encodeURIComponent(lb)}`,
          { credentials: "include" },
        );
        if (isStale(seq)) return;
        if (!r.ok) {
          setMsg(await r.text());
          setBusy(false);
          return;
        }
        const j = (await r.json()) as {
          results?: Array<{
            id: string;
            slug: string;
            title: string;
            author?: string;
            lang_a: string;
            lang_b: string;
          }>;
          count?: number;
        };
        let next: CatalogHit[] = (j.results || []).map((b) => ({
          id: b.id,
          title: b.title,
          authors: b.author || "",
          languages: [b.lang_a, b.lang_b],
          slug: b.slug,
          lang_a: b.lang_a,
          lang_b: b.lang_b,
          source: "bilinguis",
          has_cover: false,
        }));
        if (opts?.search) {
          const q = `${titleQ} ${authorQ}`.trim().toLowerCase();
          if (q) {
            next = next.filter(
              (b) => b.title.toLowerCase().includes(q) || b.authors.toLowerCase().includes(q),
            );
          }
        }
        setCefrOpen(false);
        applyHits(seq, next, {
          mode: opts?.search ? "search" : "browse",
          page: 1,
          count: Number(j.count) || next.length,
          more: false,
        });
        if (!next.length) {
          setMsg(
            t("gut_empty_pair").replace("{0}", la.toUpperCase()).replace("{1}", lb.toUpperCase()),
          );
        }
      } catch (e) {
        if (!isStale(seq)) {
          setMsg(e instanceof Error ? e.message : String(e));
          setBusy(false);
        }
      }
    },
    [authorQ, beginFetch, lang, langB, titleQ],
  );

  const loadGut = useCallback(
    async (opts: { mode: Mode; page: number; append?: boolean; cefr?: string | null; lang?: string }) => {
      const seq = beginFetch(!opts.append);
      const useLang = opts.lang !== undefined ? opts.lang : lang;
      try {
        let url: string;
        if (opts.mode === "cefr") {
          const lv = (opts.cefr || cefrRef.current || "A1").toUpperCase();
          url = `/api/catalog/gutenberg/cefr?level=${encodeURIComponent(lv)}&page=${opts.page}`;
          if (useLang) url += `&languages=${encodeURIComponent(useLang)}`;
        } else if (opts.mode === "browse") {
          url = `/api/catalog/gutenberg/popular?page=${opts.page}`;
          if (useLang) url += `&languages=${encodeURIComponent(useLang)}`;
        } else {
          const q = [titleQ.trim(), authorQ.trim()].filter(Boolean).join(" ");
          if (!q) {
            /* Язык выбран, названия нет → лента «Свободные» на этом языке */
            url = `/api/catalog/gutenberg/popular?page=${opts.page}`;
            if (useLang) url += `&languages=${encodeURIComponent(useLang)}`;
            opts = { ...opts, mode: "browse" };
          } else {
            url = `/api/catalog/gutenberg/search?q=${encodeURIComponent(q)}&page=${opts.page}`;
            if (useLang) url += `&languages=${encodeURIComponent(useLang)}`;
          }
        }
        const r = await fetch(url, { credentials: "include" });
        if (isStale(seq)) return;
        if (!r.ok) {
          const errText = await r.text();
          setMsg(errText || `HTTP ${r.status}`);
          setBusy(false);
          return;
        }
        const j = (await r.json()) as {
          results?: CatalogHit[];
          count?: number;
          next?: boolean;
        };
        const next = Array.isArray(j.results) ? j.results : [];
        applyHits(seq, next, {
          mode: opts.mode,
          page: opts.page,
          append: opts.append,
          count: Number(j.count) || next.length,
          more: Boolean(j.next) || next.length >= 16,
          cefrLv: opts.mode === "cefr" ? opts.cefr || cefrRef.current : null,
        });
      } catch (e) {
        if (!isStale(seq)) {
          setMsg(e instanceof Error ? e.message : String(e));
          setBusy(false);
        }
      }
    },
    [authorQ, beginFetch, lang, titleQ],
  );

  /** Gutenberg PD-пары (DE/FR/ES/IT) — не mono-лента */
  const loadGutPairs = useCallback(
    async (opts: { mode: Mode; page: number; append?: boolean; cefr?: string | null; lang?: string }) => {
      const seq = beginFetch(!opts.append);
      const la = (opts.lang !== undefined ? opts.lang : lang) || "en";
      const lb = langB || "de";
      try {
        let mode = opts.mode;
        const params = new URLSearchParams({
          lang_a: la,
          lang_b: lb,
          page: String(opts.page),
          mode,
        });
        if (mode === "cefr") {
          params.set("level", (opts.cefr || cefrRef.current || "A1").toUpperCase());
        } else if (mode === "search") {
          const title = titleQ.trim();
          const author = authorQ.trim();
          if (!title && !author) {
            mode = "browse";
            params.set("mode", "browse");
          } else {
            if (title) params.set("title", title);
            if (author) params.set("author", author);
          }
        }
        const r = await fetch(`/api/catalog/gutenberg/bilingual?${params}`, {
          credentials: "include",
        });
        if (isStale(seq)) return;
        if (!r.ok) {
          setMsg((await r.text()) || `HTTP ${r.status}`);
          setBusy(false);
          return;
        }
        const j = (await r.json()) as {
          results?: CatalogHit[];
          count?: number;
          next?: boolean;
        };
        const next = (Array.isArray(j.results) ? j.results : []).map((b) => ({
          ...b,
          authors: b.authors || "",
          languages: b.languages || [b.lang_a || la, b.lang_b || lb].filter(Boolean) as string[],
          lang_a: b.lang_a || la,
          lang_b: b.lang_b || lb,
          tr_id: b.tr_id ?? b.translation?.id,
          source: "gutenberg",
          bilingual: true,
        }));
        applyHits(seq, next, {
          mode,
          page: opts.page,
          append: opts.append,
          count: Number(j.count) || next.length,
          more: Boolean(j.next),
          cefrLv: mode === "cefr" ? opts.cefr || cefrRef.current : null,
        });
        if (!next.length && !opts.append) {
          setMsg(
            t("gut_empty_gut_pair").replace("{0}", la.toUpperCase()).replace("{1}", lb.toUpperCase()),
          );
        } else if (opts.mode === "browse" && !opts.append) {
          setMsg(t("gut_bi_gut_hint"));
        }
      } catch (e) {
        if (!isStale(seq)) {
          setMsg(e instanceof Error ? e.message : String(e));
          setBusy(false);
        }
      }
    },
    [authorQ, beginFetch, lang, langB, titleQ],
  );

  const load = useCallback(
    async (opts: { mode: Mode; page: number; append?: boolean; cefr?: string | null; lang?: string }) => {
      if (bilingual && pairBilinguis && (opts.mode === "browse" || opts.mode === "search")) {
        await loadBilinguis({ search: opts.mode === "search" });
        return;
      }
      if (bilingual && pairBilinguis && opts.mode === "cefr") {
        await loadBilinguis();
        setMsg(t("gut_cefr_bilinguis_hint"));
        return;
      }
      if (bilingual && !pairBilinguis) {
        await loadGutPairs(opts);
        return;
      }
      await loadGut(opts);
    },
    [bilingual, loadBilinguis, loadGut, loadGutPairs, pairBilinguis],
  );

  /** Открытие модалки */
  useEffect(() => {
    if (!open) return;
    void load({ mode: "browse", page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bilingual]);

  /** Смена языка перевода 2ЯЗ */
  useEffect(() => {
    if (!open || !bilingual) return;
    void load({ mode: "browse", page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langB]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setLangAndReload = (code: string) => {
    setLang(code);
    const m = modeRef.current;
    const c = cefrRef.current;
    if (m === "cefr" && c) {
      void load({ mode: "cefr", page: 1, cefr: c, lang: code });
    } else if (m === "search" && (titleQ.trim() || authorQ.trim())) {
      void load({ mode: "search", page: 1, lang: code });
    } else {
      void load({ mode: "browse", page: 1, lang: code });
    }
  };

  const runSearch = () => {
    const q = titleQ.trim() || authorQ.trim();
    if (!q) {
      /* Язык + Искать без названия → свободные на выбранном языке */
      void load({ mode: "browse", page: 1, lang });
      return;
    }
    void load({ mode: "search", page: 1, lang });
  };

  const runCefr = (lv: string) => {
    setCefrOpen(true);
    setCefr(lv);
    cefrRef.current = lv;
    setMode("cefr");
    modeRef.current = "cefr";
    void load({ mode: "cefr", page: 1, cefr: lv, lang });
  };

  const download = async () => {
    const book = hits.find((h) => sameId(h.id, sel));
    if (!book || downloading) return;
    const seq = ++fetchSeq.current;
    setDownloading(true);
    setBusy(true);
    setMsg(`${t("gut_downloading")}: «${book.title}»…`);
    try {
      if (book.source === "bilinguis" || (typeof book.id === "string" && book.slug)) {
        const r = await fetch("/api/catalog/bilinguis/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: book.slug,
            lang_a: book.lang_a || lang || "en",
            lang_b: book.lang_b || langB || "ru",
            title: book.title,
          }),
        });
        if (isStale(seq)) return;
        if (!r.ok) {
          setMsg(await r.text());
          return;
        }
        const j = (await r.json()) as { text_id: number; title: string };
        setMsg(`${t("library_ok")}: ${j.title}`);
        onImported?.(j);
        return;
      }
      const trId = book.tr_id ?? book.translation?.id;
      if (bilingual && trId != null && typeof book.id === "number") {
        const r = await fetch("/api/catalog/gutenberg/bilingual/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gutenberg_id: book.id,
            gutenberg_id_tr: trId,
            title: book.title,
            lang_a: book.lang_a || lang || "en",
            lang_b: book.lang_b || langB || "de",
          }),
        });
        if (isStale(seq)) return;
        if (!r.ok) {
          setMsg(await r.text());
          return;
        }
        const j = (await r.json()) as { text_id: number; title: string };
        setMsg(`${t("library_ok")}: ${j.title}`);
        onImported?.(j);
        return;
      }
      if (bilingual && !trId) {
        setMsg(t("gut_no_pair"));
        return;
      }
      const r = await fetch("/api/catalog/gutenberg/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gutenberg_id: book.id,
          title: book.title,
          lang: book.languages[0] || lang || "en",
        }),
      });
      if (isStale(seq)) return;
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const j = (await r.json()) as { text_id: number; title: string };
      setMsg(`${t("library_ok")}: ${j.title}`);
      onImported?.(j);
    } catch (e) {
      if (!isStale(seq)) setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (!isStale(seq)) {
        setBusy(false);
        setDownloading(false);
      }
    }
  };

  const pickBook = (id: number | string) => {
    setSel(id);
    const book = hits.find((h) => sameId(h.id, id));
    if (book) setMsg(`${t("gut_selected")}: ${book.title}`);
  };

  if (!open) return null;
  const selected = hits.find((h) => sameId(h.id, sel)) ?? null;
  const withCover = hits.filter((h) => h.has_cover || h.cover_url).length;
  const withTr = bilingual
    ? hits.filter((h) => h.tr_id != null || h.translation?.id != null || h.source === "bilinguis").length
    : 0;
  const listPages = Math.max(1, Math.ceil(hits.length / LIST_PAGE) || 1);
  const listSafe = Math.min(listPage, listPages - 1);
  const visible = hits.slice(listSafe * LIST_PAGE, listSafe * LIST_PAGE + LIST_PAGE);
  const origLangs = bilingual ? LANGS_ORIG : LANGS_GUT;
  const titleKey = bilingual ? "gut_title_2lang" : "gut_title";

  return (
    <div className="gut-overlay" role="dialog" aria-modal="true" aria-label={t(titleKey)}>
      <div className="gut-modal inst-panel">
        <header className="gut-head">
          <button type="button" className="hud-btn gut-back" onClick={onClose}>
            ← {t("gut_nav_back")}
          </button>
          <div className="gut-head-text">
            <h2 className="route-title gut-title">{t(titleKey)}</h2>
            <p className="muted gut-sub">{bilingual ? t("gut_sub_2lang") : t("gut_sub")}</p>
          </div>
          {/* сверху справа — иначе футер уезжает за низ экрана (free / search / 2ЯЗ) */}
          <button
            type="button"
            className={`hud-btn ok gut-dl-top ${downloading ? "amber" : ""}`}
            disabled={busy || downloading || !selected}
            title={selected ? selected.title : undefined}
            onClick={() => void download()}
          >
            {downloading
              ? `… ${t("gut_downloading")}`
              : `⇩ ${bilingual ? t("gut_download_2lang") : t("gut_download")}`}
          </button>
        </header>

        <p className="muted gut-hint">{bilingual ? t("gut_hint_2lang") : t("gut_hint")}</p>

        <div className="gut-form">
          <label>
            <span className="lab">{t("gut_title_field")}</span>
            <input
              value={titleQ}
              onChange={(e) => setTitleQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
          </label>
          <label>
            <span className="lab">{t("gut_author")}</span>
            <input
              value={authorQ}
              onChange={(e) => setAuthorQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
          </label>
          <div className="gut-langs">
            <span className="lab">{bilingual ? t("gut_orig") : t("gut_lang")}</span>
            <div className="gut-lang-row">
              {origLangs.map((code) => (
                <button
                  key={code || "all"}
                  type="button"
                  className={`hud-btn ${lang === code ? "amber" : ""}`}
                  disabled={busy}
                  onClick={() => setLangAndReload(code)}
                >
                  {code ? code.toUpperCase() : t("gut_lang_all")}
                </button>
              ))}
            </div>
          </div>
          <div className="gut-form-acts">
            <button type="button" className="hud-btn" disabled={busy} onClick={runSearch}>
              🔍 {t("search")}
            </button>
            <button
              type="button"
              className="hud-btn amber"
              disabled={busy}
              onClick={() => {
                setCefrOpen(false);
                setCefr(null);
                cefrRef.current = null;
                void load({ mode: "browse", page: 1, lang });
              }}
            >
              ★ {t("gut_free")}
            </button>
            {!bilingual || !pairBilinguis ? (
              <button
                type="button"
                className={`hud-btn ok ${cefrOpen || mode === "cefr" ? "on amber" : ""}`}
                disabled={busy}
                onClick={() => {
                  const next = !cefrOpen;
                  setCefrOpen(next);
                  if (next && !cefr) setMsg(t("gut_cefr_pick"));
                }}
              >
                ▤ {t("gut_by_cefr")}
              </button>
            ) : null}
          </div>
        </div>

        {bilingual ? (
          <div className="gut-cefr gut-tr-row">
            <span className="lab">{t("gut_trans")}</span>
            <div className="gut-lang-row">
              {LANGS_TR.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`hud-btn ${langB === code ? "ok" : ""}`}
                  disabled={busy}
                  onClick={() => setLangB(code)}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="muted gut-cefr-note">{t("gut_trans_note")}</span>
          </div>
        ) : null}

        {cefrOpen && (!bilingual || !pairBilinguis) ? (
          <div className="gut-cefr">
            <span className="lab">{t("gut_cefr_level")}</span>
            <div className="gut-lang-row">
              {CEFR.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  className={`hud-btn ${cefr === lv && mode === "cefr" ? "amber" : ""}`}
                  disabled={busy}
                  onClick={() => runCefr(lv)}
                >
                  {lv}
                </button>
              ))}
            </div>
            <span className="muted gut-cefr-note">{t("gut_cefr_note")}</span>
          </div>
        ) : null}

        <p className="muted gut-status">
          {bilingual
            ? t("gut_status_2lang")
                .replace("{0}", String(hits.length))
                .replace("{1}", String(visible.length))
                .replace("{2}", String(listPages))
                .replace("{3}", String(withCover))
            : t("gut_status_tab")
                .replace("{0}", String(catalogCount))
                .replace("{1}", String(visible.length))
                .replace("{2}", String(hits.length))
                .replace("{3}", String(withCover))}
          {bilingual && withTr ? ` · 2ЯЗ: ${withTr}` : ""}
          {mode === "cefr" && cefr ? ` · CEFR ${cefr}` : ""}
          {lang ? ` · ${(lang || "").toUpperCase()}` : ` · ${t("gut_lang_all")}`}
          {bilingual && langB ? `→${langB.toUpperCase()}` : ""}
        </p>

        {msg ? <p className="mission-map-hint gut-msg">{msg}</p> : null}

        {listPages > 1 ? (
          <div className="gut-list-pages" role="tablist" aria-label={t(titleKey)}>
            <span className="muted gut-cefr-note">{t("gut_tabs")}</span>
            {Array.from({ length: listPages }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={listSafe === i}
                className={`hud-btn ${listSafe === i ? "amber" : ""}`}
                onClick={() => setListPage(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}

        <ul className="gut-list" role="listbox" aria-busy={busy} data-page-size={LIST_PAGE}>
          {visible.map((b) => {
            const on = sameId(b.id, sel);
            const pair =
              b.lang_a && b.lang_b
                ? `${b.lang_a.toUpperCase()}→${b.lang_b.toUpperCase()}`
                : (b.languages || []).join(", ").toUpperCase() || (lang || "—").toUpperCase();
            return (
              <li key={String(b.id)} className={on ? "on" : undefined}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`gut-row ${on ? "on" : ""}`}
                  onClick={() => pickBook(b.id)}
                  onDoubleClick={() => void download()}
                >
                  <span className="gut-cover" aria-hidden>
                    {b.cover_url ? (
                      <img src={b.cover_url} alt="" loading="lazy" />
                    ) : (
                      <span className="gut-cover-ph">
                        {b.source === "bilinguis" || b.bilingual || b.tr_id ? "2ЯЗ" : "★"}
                      </span>
                    )}
                  </span>
                  <span className="gut-row-info">
                    <strong>{b.title}</strong>
                    <span className="muted">
                      {b.authors || "—"}
                      {b.cefr ? ` · ${b.cefr}` : ""}
                      {" · "}
                      {bilingual ? `${t("gut_pair")} ${pair}` : pair}
                      {b.download_count ? ` · ↓${b.download_count}` : ""}
                      {" · "}
                      {b.has_cover || b.cover_url ? t("gut_has_cover") : t("gut_no_cover")}
                    </span>
                  </span>
                  {on ? <span className="gut-sel-mark" aria-hidden>✓</span> : null}
                </button>
              </li>
            );
          })}
          {!visible.length && !busy ? <li className="muted gut-empty">{t("gut_empty")}</li> : null}
          {busy && !visible.length ? <li className="muted gut-empty">{t("gut_loading")}</li> : null}
        </ul>

        <footer className="gut-foot">
          <button
            type="button"
            className="hud-btn"
            disabled={busy || !hits.length || !hasMore}
            onClick={() => void load({ mode, page: page + 1, append: true, cefr, lang })}
          >
            {t("gut_more")}
          </button>
          {bilingual ? (
            <button
              type="button"
              className="hud-btn ok"
              disabled={busy || downloading}
              onClick={() => setManualOpen(true)}
            >
              {t("bi_manual_btn")}
            </button>
          ) : null}
          <button type="button" className="hud-btn gut-foot-prep" onClick={onClose}>
            ← {bilingual ? t("gut_nav_back") : t("gut_to_prep")}
          </button>
        </footer>
      </div>

      {bilingual ? (
        <BilingualManualModal
          open={manualOpen}
          defaultLangA={lang || "en"}
          defaultLangB={langB || "ru"}
          onClose={() => setManualOpen(false)}
          onImported={(info) => {
            setManualOpen(false);
            setMsg(`${t("library_ok")}: ${info.title}`);
            onImported?.(info);
            onClose();
          }}
        />
      ) : null}
    </div>
  );
}
