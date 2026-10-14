/** ИЗ КНИГИ — хаб + формирование карточек. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import { useReadingPos } from "../reading/positionStore";

type BookRow = {
  text_id: number;
  title: string;
  segments: number;
  sentence_id: number;
  chars: number;
  words: number;
};

type Props = {
  onPractice: () => void;
};

export default function FromBookPage({ onPractice }: Props) {
  const jump = useReadingPos((s) => s.jump);
  const curId = useReadingPos((s) => s.textId);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const r = await fetch("/api/english/book/hub", { credentials: "include" });
    if (r.ok) setBooks(await r.json());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const formCards = async (b: BookRow) => {
    setBusy(true);
    setMsg("");
    try {
      jump(b.text_id, b.sentence_id || 0);
      const r = await fetch("/api/english/from-book", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_id: b.text_id,
          up_to_sentence_id: Math.max(b.sentence_id + 30, 10),
          limit: 24,
        }),
      });
      if (!r.ok) {
        setMsg(await r.text());
        return;
      }
      const j = (await r.json()) as { cards: number };
      setMsg(t("en_book_formed").replace("{0}", String(j.cards)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="en-from-book">
      <header className="missions-map-head">
        <h2 className="route-title">{t("en_from_book_title")}</h2>
        <p className="muted">{t("en_from_book_blurb")}</p>
      </header>
      {msg && <p className="mission-map-hint">{msg}</p>}
      <ul className="en-book-list">
        {books.map((b) => (
          <li key={b.text_id} className={`en-book-row ${curId === b.text_id ? "on" : ""}`}>
            <div>
              <strong>{b.title}</strong>
              <p className="muted">
                {t("en_book_meta")
                  .replace("{0}", String(b.sentence_id))
                  .replace("{1}", String(b.segments))}
              </p>
            </div>
            <div className="bridge-actions">
              <button type="button" className="hud-btn amber" disabled={busy} onClick={() => void formCards(b)}>
                {t("en_book_form")}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  jump(b.text_id, b.sentence_id || 0);
                  onPractice();
                }}
              >
                {t("en_book_practice")}
              </button>
            </div>
          </li>
        ))}
        {!books.length && <li className="muted">{t("from_book_need")}</li>}
      </ul>
    </section>
  );
}
