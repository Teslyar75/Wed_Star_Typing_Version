/** Читалка «Книга»: 1 стр / разворот / 2 языка / прокрутка + темы (порт book_reader UI). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import {
  countWords,
  etaMinutes,
  paginateBookText,
  type BookMode,
  type BookTheme,
} from "./bookPaginate";
import { fixedBilingualRight, parasFromSegments, rightFromSegments, splitParas, type BiSeg } from "./biPageTr";

type Props = {
  text: string;
  title: string;
  textId?: number | null;
  fontPt: number;
  mode: BookMode;
  theme: BookTheme;
  onFontPt: (n: number) => void;
  onMode: (m: BookMode) => void;
  onTheme: (th: BookTheme) => void;
  onLibrary: () => void;
  onHyperdrive: () => void;
  onCards?: () => void;
};

/** line-height текста в порте (px); fallback = font × 1.95 как в CSS */
function readScrollLineHeight(port: HTMLElement): number {
  const sample =
    port.querySelector<HTMLElement>(".sr-book-scroll-para") ||
    port.querySelector<HTMLElement>(".sr-book-sheet.scroll") ||
    port;
  const cs = getComputedStyle(sample);
  const lh = parseFloat(cs.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(cs.fontSize);
  return (Number.isFinite(fs) && fs > 0 ? fs : 16) * 1.95;
}

/**
 * Подгонка порта под целое число строк + шаг «страница − 1 строка»
 * (как Tk yview_scroll(…, "pages"): последняя строка → первая на новом экране).
 */
function fitScrollPage(port: HTMLElement): { lineHeight: number; lines: number; step: number } {
  const frame = port.parentElement;
  port.style.flex = "";
  port.style.height = "";
  if (!frame) {
    const lh = readScrollLineHeight(port);
    const lines = Math.max(2, Math.floor(port.clientHeight / lh));
    return { lineHeight: lh, lines, step: Math.max(lh, (lines - 1) * lh) };
  }
  const fs = getComputedStyle(frame);
  const padY = (parseFloat(fs.paddingTop) || 0) + (parseFloat(fs.paddingBottom) || 0);
  const avail = Math.max(0, frame.clientHeight - padY);
  const lh = readScrollLineHeight(port);
  const lines = Math.max(2, Math.floor(avail / Math.max(1, lh)));
  const fitH = lines * lh;
  port.style.flex = "0 0 auto";
  port.style.height = `${fitH}px`;
  return { lineHeight: lh, lines, step: Math.max(lh, (lines - 1) * lh) };
}

export default function BookReaderView({
  text,
  title,
  textId = null,
  fontPt,
  mode,
  theme,
  onFontPt,
  onMode,
  onTheme,
  onLibrary,
  onHyperdrive,
  onCards,
}: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const pages = useMemo(() => paginateBookText(text, mode), [text, mode]);
  const [idx, setIdx] = useState(0);
  /** прогресс вертикальной прокрутки 0…1 (режим scroll) */
  const [scrollFrac, setScrollFrac] = useState(0);
  /** сегменты 2ЯЗ — полный параллельный текст */
  const [biSegs, setBiSegs] = useState<BiSeg[]>([]);
  /** как desktop book_reader._fullscreen — ЭКРАН / ✕ */
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setIdx(0);
  }, [text, mode]);

  useEffect(() => {
    if (mode !== "bilingual" || textId == null) {
      setBiSegs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const all: BiSeg[] = [];
      let offset = 0;
      const pageSize = 800;
      try {
        while (!cancelled) {
          const r = await fetch(
            `/api/reader/${textId}/bilingual?offset=${offset}&limit=${pageSize}`,
            { credentials: "include" },
          );
          if (!r.ok) break;
          const rows = (await r.json()) as BiSeg[];
          if (!Array.isArray(rows) || !rows.length) break;
          all.push(
            ...rows.map((x) => ({
              original: x.original || "",
              translation: x.translation || "",
              para_idx: Number(x.para_idx) || 0,
            })),
          );
          if (rows.length < pageSize) break;
          offset += rows.length;
          if (offset > 20000) break;
        }
        if (!cancelled) setBiSegs(all);
      } catch {
        if (!cancelled) setBiSegs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, textId]);

  /* левая страница режется по `text` — ищем индекс в тех же абзацах */
  const bookOrigParas = useMemo(() => splitParas(text), [text]);
  const bookTrParas = useMemo(() => {
    if (!biSegs.length) return [] as string[];
    const fromSeg = parasFromSegments(biSegs);
    /* если абзацев перевода столько же, сколько в оригинале — ок; иначе по para_idx */
    return fromSeg.tr;
  }, [biSegs]);

  const exitFullscreen = useCallback(async () => {
    setFullscreen(false);
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement || doc.webkitExitFullscreen) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const enterFullscreen = useCallback(async () => {
    setFullscreen(true);
    const el = rootRef.current as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else await el.webkitRequestFullscreen?.();
    } catch {
      /* CSS .is-fs уже покрывает весь экран */
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (fullscreen) void exitFullscreen();
    else void enterFullscreen();
  }, [fullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      const el = rootRef.current;
      const apiOn = Boolean(el && document.fullscreenElement === el);
      /* Esc из Fullscreen API — выключаем и CSS-фолбэк .is-fs */
      if (!document.fullscreenElement) setFullscreen(false);
      else if (apiOn) setFullscreen(true);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const safeIdx = Math.max(0, Math.min(idx, Math.max(0, pages.length - 1)));
  const left = pages[safeIdx] || "";
  /* 2ЯЗ: справа перевод только текущей левой страницы (не вся книга) */
  const biRight = useMemo(() => {
    if (mode !== "bilingual") return "";
    if (biSegs.length) {
      const bySeg = rightFromSegments(left, biSegs);
      if (bySeg) return bySeg;
    }
    const byPara = fixedBilingualRight(left, bookOrigParas, bookTrParas);
    if (byPara) return byPara;
    return biSegs.length ? t("hd_ctx_tr") : "";
  }, [mode, left, bookOrigParas, bookTrParas, biSegs]);
  const right = mode === "spread" ? pages[safeIdx + 1] || "" : mode === "bilingual" ? biRight : "";

  const wordsTotal = countWords(text);
  const wordsBefore = pages.slice(0, safeIdx).reduce((n, p) => n + countWords(p), 0);
  const wordsLeft = Math.max(0, wordsTotal - wordsBefore);
  const pageLabel =
    mode === "spread"
      ? `${safeIdx + 1}–${Math.min(safeIdx + 2, pages.length)} / ${pages.length}`
      : mode === "scroll"
        ? `${Math.round(scrollFrac * 100)}%`
        : `${safeIdx + 1} / ${pages.length}`;
  const pct =
    mode === "scroll"
      ? Math.round(scrollFrac * 100)
      : wordsTotal
        ? Math.min(100, Math.round((wordsBefore / wordsTotal) * 100))
        : 0;
  const canPrev = mode === "scroll" ? scrollFrac > 0.001 : safeIdx > 0;
  const canNext =
    mode === "scroll"
      ? scrollFrac < 0.998
      : safeIdx < pages.length - (mode === "spread" ? 2 : 1);

  const syncScrollFrac = useCallback((el: HTMLElement) => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    setScrollFrac(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
  }, []);

  /** desktop yview_scroll(±1, "pages"): шаг = (N−1)·lh, последняя строка остаётся первой */
  const scrollByPage = useCallback(
    (dir: -1 | 1) => {
      const el = scrollRef.current;
      if (!el) return;
      const { step } = fitScrollPage(el);
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max <= 0 || step <= 0) {
        syncScrollFrac(el);
        return;
      }
      const cur = el.scrollTop;
      const next = Math.max(0, Math.min(max, cur + dir * step));
      el.scrollTop = next;
      syncScrollFrac(el);
    },
    [syncScrollFrac],
  );

  const go = useCallback(
    (delta: number) => {
      if (mode === "scroll") {
        scrollByPage(delta < 0 ? -1 : 1);
        return;
      }
      const step = mode === "spread" ? 2 : 1;
      setIdx((i) => Math.max(0, Math.min(pages.length - 1, i + delta * step)));
    },
    [mode, pages.length, scrollByPage],
  );

  /* callback-ref: слушатель вешается когда порт реально смонтирован */
  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (!node) return;
      syncScrollFrac(node);
    },
    [syncScrollFrac],
  );

  useEffect(() => {
    if (mode !== "scroll") {
      setScrollFrac(0);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const layout = () => {
      fitScrollPage(el);
      syncScrollFrac(el);
    };
    layout();
    const onScroll = () => syncScrollFrac(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    const frame = el.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            layout();
          })
        : null;
    if (frame) ro?.observe(frame);
    else ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      el.style.flex = "";
      el.style.height = "";
    };
  }, [mode, text, fontPt, fullscreen, syncScrollFrac]);

  useEffect(() => {
    /* фокус на читалке — ←→ листают страницы, а не toolbar */
    rootRef.current?.focus({ preventScroll: true });
  }, [mode, textId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      /* пока «Книга» на экране — стрелки листают (не прыжок по вкладкам) */
      if (!rootRef.current) return;
      if (e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        return;
      }
      if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        e.stopPropagation();
        void exitFullscreen();
        return;
      }
      if (mode === "scroll") {
        const el = scrollRef.current;
        const top = el?.scrollTop ?? 0;
        const max = el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0;
        const up = e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp";
        const down = e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown";
        if (up && top > 0) {
          e.preventDefault();
          e.stopPropagation();
          go(-1);
        } else if (down && top < max - 1) {
          e.preventDefault();
          e.stopPropagation();
          go(1);
        }
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "PageUp") && canPrev) {
        e.preventDefault();
        e.stopPropagation();
        go(-1);
      } else if ((e.key === "ArrowRight" || e.key === "PageDown") && canNext) {
        e.preventDefault();
        e.stopPropagation();
        go(1);
      }
    };
    /* capture — раньше App/keyboardNav */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fullscreen, toggleFullscreen, exitFullscreen, canPrev, canNext, go, mode]);

  const goLibrary = () => {
    if (fullscreen) void exitFullscreen();
    onLibrary();
  };

  return (
    <section
      ref={rootRef}
      className={`sr-book-reader theme-${theme}${fullscreen ? " is-fs" : ""}`}
      data-nav-lock="book"
      tabIndex={-1}
    >
      <header className="sr-book-toolbar">
        <button type="button" className="hud-btn" onClick={goLibrary}>
          ← {t("library")}
        </button>
        <button type="button" className="hud-btn amber sr-book-nav" onClick={() => go(-1)} disabled={mode !== "scroll" && !canPrev}>
          ← {t("sr_book_prev")}
        </button>
        <button type="button" className="hud-btn amber sr-book-nav" onClick={() => go(1)} disabled={mode !== "scroll" && !canNext}>
          {t("sr_book_next")} →
        </button>
        <button type="button" className="hud-btn" onClick={() => onFontPt(Math.max(12, fontPt - 1))}>
          A−
        </button>
        <button type="button" className="hud-btn" onClick={() => onFontPt(Math.min(28, fontPt + 1))}>
          A+
        </button>

        <span className="sr-book-sep" aria-hidden />

        {(
          [
            ["page", t("sr_book_page")],
            ["spread", t("sr_book_spread")],
            ["bilingual", t("sr_book_bi")],
            ["scroll", t("sr_book_scroll")],
          ] as const
        ).map(([id, lab]) => (
          <button
            key={id}
            type="button"
            className={`hud-btn ${mode === id ? "amber" : ""}`}
            onClick={() => onMode(id)}
          >
            {lab}
          </button>
        ))}

        <span className="sr-book-sep" aria-hidden />

        {(
          [
            ["paper", t("sr_book_paper")],
            ["night", t("sr_book_night")],
            ["sepia", t("sr_book_sepia")],
          ] as const
        ).map(([id, lab]) => (
          <button
            key={id}
            type="button"
            className={`hud-btn ${theme === id ? "amber" : ""}`}
            onClick={() => onTheme(id)}
          >
            {lab}
          </button>
        ))}

        <button type="button" className="hud-btn amber" onClick={onHyperdrive}>
          ⚡ RSVP
        </button>
        {/* desktop: сразу после RSVP — ЭКРАН / ✕ (F11 / Esc) */}
        <button
          type="button"
          className={`hud-btn ${fullscreen ? "amber" : "ok"}`}
          title={fullscreen ? t("sr_book_fs_exit_tip") : t("sr_book_fs_tip")}
          onClick={toggleFullscreen}
        >
          {fullscreen ? "✕" : t("sr_book_fs")}
        </button>
        {onCards ? (
          <button type="button" className="hud-btn amber sr-book-cards" onClick={onCards}>
            → {t("sr_book_cards")}
          </button>
        ) : null}
      </header>

      <div className={`sr-book-stage mode-${mode}`}>
        <button
          type="button"
          className="sr-book-side-nav prev"
          disabled={mode === "scroll" ? false : !canPrev}
          aria-label={t("sr_book_prev")}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        {mode === "scroll" ? (
          <div className="sr-book-scroll-frame">
            <div className="sr-book-scroll-port" ref={setScrollNode}>
              <article className="sr-book-sheet scroll" style={{ fontSize: `${fontPt + 1}px` }}>
                <h3 className="sr-book-sheet-title">{title}</h3>
                <div className="sr-book-sheet-text sr-book-scroll-body">
                  {splitParas(text).map((para, i) => (
                    <p key={i} className="sr-book-scroll-para">
                      {para}
                    </p>
                  ))}
                </div>
              </article>
            </div>
          </div>
        ) : mode === "page" ? (
          <article className="sr-book-sheet single" style={{ fontSize: `${fontPt}px` }}>
            <div className="sr-book-sheet-text">{left}</div>
          </article>
        ) : (
          <div className="sr-book-spread">
            <article className="sr-book-sheet" style={{ fontSize: `${fontPt}px` }}>
              {mode === "bilingual" ? <div className="sr-book-col-lab">{t("sr_original")}</div> : null}
              <div className="sr-book-sheet-text">{left}</div>
            </article>
            <div className="sr-book-gutter" aria-hidden />
            <article className="sr-book-sheet" style={{ fontSize: `${fontPt}px` }}>
              {mode === "bilingual" ? <div className="sr-book-col-lab">{t("hd_translation")}</div> : null}
              <div className="sr-book-sheet-text">{right}</div>
            </article>
          </div>
        )}
        <button
          type="button"
          className="sr-book-side-nav next"
          disabled={mode === "scroll" ? false : !canNext}
          aria-label={t("sr_book_next")}
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>

      <footer className="sr-book-foot">
        <button
          type="button"
          className="hud-btn amber sr-book-nav"
          onClick={() => go(-1)}
          disabled={mode !== "scroll" && !canPrev}
        >
          ← {t("sr_book_prev")}
        </button>
        {onCards ? (
          <button type="button" className="hud-btn amber" onClick={onCards}>
            {t("sr_book_make_cards")}
          </button>
        ) : null}
        <div className="sr-book-progress" aria-hidden>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="sr-book-meta muted">
          {pageLabel}
          {" · "}~{etaMinutes(wordsLeft)} {t("sr_book_min")}
        </div>
        <button
          type="button"
          className="hud-btn amber sr-book-nav"
          onClick={() => go(1)}
          disabled={mode !== "scroll" && !canNext}
        >
          {t("sr_book_next")} →
        </button>
      </footer>
    </section>
  );
}
