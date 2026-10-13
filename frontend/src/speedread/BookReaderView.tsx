/** Читалка «Книга»: 1 стр / разворот / 2 языка / прокрутка + темы (порт book_reader UI). */
import { useEffect, useMemo, useState } from "react";
import { t } from "../i18n";
import {
  countWords,
  etaMinutes,
  paginateBookText,
  type BookMode,
  type BookTheme,
} from "./bookPaginate";

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
  const pages = useMemo(() => paginateBookText(text, mode), [text, mode]);
  const [idx, setIdx] = useState(0);
  const [biRight, setBiRight] = useState<string>("");

  useEffect(() => {
    setIdx(0);
  }, [text, mode]);

  useEffect(() => {
    if (mode !== "bilingual" || textId == null) {
      setBiRight("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/reader/${textId}/bilingual?offset=0&limit=80`, {
          credentials: "include",
        });
        if (!r.ok || cancelled) return;
        const rows = (await r.json()) as { translation?: string; original?: string }[];
        const joined = rows
          .map((x) => (x.translation || "").trim())
          .filter(Boolean)
          .join("\n\n");
        if (!cancelled) setBiRight(joined || t("hd_ctx_tr"));
      } catch {
        if (!cancelled) setBiRight(t("hd_ctx_tr"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, textId]);

  const safeIdx = Math.max(0, Math.min(idx, Math.max(0, pages.length - 1)));
  const left = pages[safeIdx] || "";
  const right =
    mode === "spread"
      ? pages[safeIdx + 1] || ""
      : mode === "bilingual"
        ? biRight
        : "";

  const wordsTotal = countWords(text);
  const wordsBefore = pages.slice(0, safeIdx).reduce((n, p) => n + countWords(p), 0);
  const wordsLeft = Math.max(0, wordsTotal - wordsBefore);
  const pageLabel =
    mode === "spread"
      ? `${safeIdx + 1}–${Math.min(safeIdx + 2, pages.length)} / ${pages.length}`
      : mode === "scroll"
        ? `1 / 1`
        : `${safeIdx + 1} / ${pages.length}`;
  const pct = wordsTotal ? Math.min(100, Math.round((wordsBefore / wordsTotal) * 100)) : 0;

  const go = (delta: number) => {
    const step = mode === "spread" ? 2 : 1;
    setIdx((i) => Math.max(0, Math.min(pages.length - 1, i + delta * step)));
  };

  return (
    <section className={`sr-book-reader theme-${theme}`} data-nav-group="sr-book">
      <header className="sr-book-toolbar">
        <button type="button" className="hud-btn" onClick={onLibrary}>
          ← {t("library")}
        </button>
        <button type="button" className="hud-btn" onClick={() => go(-1)} disabled={safeIdx <= 0 || mode === "scroll"}>
          ←
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={() => go(1)}
          disabled={mode === "scroll" || safeIdx >= pages.length - (mode === "spread" ? 2 : 1)}
        >
          →
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
        {onCards ? (
          <button type="button" className="hud-btn amber sr-book-cards" onClick={onCards}>
            → {t("sr_book_cards")}
          </button>
        ) : null}
      </header>

      <div className={`sr-book-stage mode-${mode}`}>
        {mode === "scroll" ? (
          <article className="sr-book-sheet scroll" style={{ fontSize: `${fontPt}px` }}>
            <h3 className="sr-book-sheet-title">{title}</h3>
            <div className="sr-book-sheet-text">{left}</div>
          </article>
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
      </div>

      <footer className="sr-book-foot">
        {onCards ? (
          <button type="button" className="hud-btn amber" onClick={onCards}>
            {t("sr_book_make_cards")}
          </button>
        ) : (
          <span />
        )}
        <div className="sr-book-progress" aria-hidden>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="sr-book-meta muted">
          {pageLabel}
          {" · "}~{etaMinutes(wordsLeft)} {t("sr_book_min")}
        </div>
      </footer>
    </section>
  );
}
