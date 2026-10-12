import { useEffect, useState } from "react";
import { t } from "../i18n";
import { useReadingPos } from "../reading/positionStore";

type ShelfItem = {
  text_id: number;
  title: string;
  sentence_id: number;
  mode: string;
  progress_pct?: number;
  segments: number;
};

type Dossier = {
  sessions: number;
  best_cpm: number;
  english_reviews: number;
  books_on_shelf: number;
  speed_runs: number;
  xp: number;
};

type Props = {
  onOpenLibrary?: () => void;
  onOpenReader?: () => void;
  onOpenEnglish?: () => void;
  onOpenSpeed?: () => void;
  onOpenAuth?: () => void;
};

export default function ContinueHub({ onOpenLibrary, onOpenReader, onOpenEnglish, onOpenSpeed, onOpenAuth }: Props) {
  const jump = useReadingPos((s) => s.jump);
  const [book, setBook] = useState<ShelfItem | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const shelf = await (await fetch("/api/library", { credentials: "include" })).json();
        if (Array.isArray(shelf) && shelf.length) {
          const cont = shelf.find((x: ShelfItem) => (x.sentence_id || 0) > 0) || shelf[0];
          setBook(cont);
        }
      } catch {
        /* ignore */
      }
      try {
        const d = await fetch("/api/pilots/dossier", { credentials: "include" });
        if (d.ok) setDossier(await d.json());
      } catch {
        /* guest */
      }
      try {
        const p = await fetch("/api/english/progress", { credentials: "include" });
        if (p.ok) {
          const j = await p.json();
          setDue(typeof j.due === "number" ? j.due : null);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const openBook = (mode: "reader" | "english" | "speed") => {
    if (!book) {
      onOpenLibrary?.();
      return;
    }
    jump(book.text_id, book.sentence_id || 0);
    void fetch(`/api/library/${book.text_id}/position`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence_id: book.sentence_id || 0, mode }),
    });
    if (mode === "reader") onOpenReader?.();
    else if (mode === "english") onOpenEnglish?.();
    else onOpenSpeed?.();
  };

  return (
    <section className="continue-hub" aria-label={t("continue_reading")}>
      <div className="bridge-actions" style={{ flexWrap: "wrap" }}>
        {book ? (
          <>
            <button type="button" className="hud-btn amber" onClick={() => openBook("reader")}>
              {t("continue_reading")}: {book.title || `#${book.text_id}`} ({Math.round(book.progress_pct || 0)}%)
            </button>
            <button type="button" className="hud-btn" onClick={() => openBook("english")}>
              {t("from_book")}
              {due != null ? ` · due ${due}` : ""}
            </button>
            <button type="button" className="hud-btn" onClick={() => openBook("speed")}>
              {t("speed")}
            </button>
          </>
        ) : (
          <button type="button" className="hud-btn amber" onClick={() => onOpenLibrary?.()}>
            {t("library")}
          </button>
        )}
      </div>
      {dossier ? (
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          7d: {dossier.sessions} sess · CPM {Math.round(dossier.best_cpm)} · EN {dossier.english_reviews} · speed{" "}
          {dossier.speed_runs} · XP {dossier.xp}
          {due != null ? ` · due ${due}` : ""}
        </p>
      ) : (
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          <button type="button" className="hud-btn" onClick={() => onOpenAuth?.()}>
            {t("crew")}
          </button>{" "}
          — {t("dossier")}
        </p>
      )}
    </section>
  );
}
