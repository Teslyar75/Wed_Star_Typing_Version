/** ПРОВЕРКА СИСТЕМ — карточка по центру как tab_05. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import SpeakButton from "./SpeakButton";
import type { EnWord } from "./types";

type Props = {
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  reverse?: boolean;
};

export default function ReviewPage({ onDuck, ttsRate = 1, reverse = false }: Props) {
  const [words, setWords] = useState<EnWord[]>([]);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    const r = await fetch("/api/english/warehouse?limit=40&bin=due", { credentials: "include" });
    const rows = (await r.json()) as EnWord[];
    setWords(Array.isArray(rows) ? rows : []);
    setI(0);
    setShow(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !show) {
        e.preventDefault();
        setShow(true);
        return;
      }
      if (!show) return;
      if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        void grade(Number(e.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, words, i]);

  const w = words[i];
  const front = reverse ? w?.translation || w?.word : w?.word;
  const back = reverse ? w?.word : w?.translation || w?.definition;
  const left = Math.max(0, words.length - i);

  const grade = async (g: number) => {
    if (!w) return;
    const r = await fetch("/api/english/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, grade: g }),
    });
    if (r.ok) {
      const j = (await r.json()) as { preview_days?: number; interval?: number };
      setPreview(t("en_next_in").replace("{0}", String(j.preview_days ?? j.interval ?? 1)));
    }
    setShow(false);
    if (i + 1 >= words.length) {
      setMsg(t("en_review_done"));
      void reload();
    } else {
      setI((x) => x + 1);
    }
  };

  const addNew = async () => {
    const r = await fetch("/api/english/warehouse?limit=10&bin=inbox", { credentials: "include" });
    const rows = (await r.json()) as EnWord[];
    for (const row of rows.slice(0, 10)) {
      await fetch("/api/english/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: row.id, grade: 2 }),
      });
    }
    setMsg(t("en_added_new").replace("{0}", "10"));
    void reload();
  };

  if (!w) {
    return (
      <div className="en-review empty">
        <p className="lead">{t("en_review_empty")}</p>
        <button type="button" className="hud-btn amber" onClick={() => void addNew()}>
          {t("en_add_10")}
        </button>
      </div>
    );
  }

  return (
    <section className="en-review">
      <header className="en-review-head">
        <div>
          <h2 className="route-title">{t("en_systems_left").replace("{0}", String(left))}</h2>
          <p className="muted en-starmaps-hint">{t("en_systems_hint")}</p>
        </div>
        <div className="en-route-bar">
          <span className="lab">{t("en_route_progress")}</span>
          <div className="en-lvl-bar">
            <div style={{ width: `${(i / Math.max(1, words.length)) * 100}%` }} />
          </div>
          <span className="mono muted">
            {i} / {words.length}
          </span>
        </div>
      </header>

      <div className="en-review-card inst-panel">
        <div className="muted mono en-review-meta">
          #{w.rank || w.id} · {(w.pos || "—").toUpperCase()}
          {preview ? ` · ${preview}` : ""}
        </div>
        <h2 className="en-review-word">{show ? back : front}</h2>
        {show && (
          <div className="en-review-back">
            <p className="en-review-en">{reverse ? w.translation : w.word}</p>
            {w.ipa && <p className="en-ipa">/{w.ipa}/</p>}
            {w.definition && <p className="muted">{w.definition}</p>}
            {w.example && <p className="muted">{w.example}</p>}
          </div>
        )}
        <div className="bridge-actions en-review-acts">
          {!show ? (
            <button type="button" className="hud-btn amber en-decrypt-btn" onClick={() => setShow(true)}>
              {t("en_decrypt")}
            </button>
          ) : (
            <>
              <SpeakButton text={w.word} rate={ttsRate} onDuck={onDuck} />
              {[
                { g: 1, lab: t("en_grade_1") },
                { g: 2, lab: t("en_grade_2") },
                { g: 3, lab: t("en_grade_3") },
                { g: 4, lab: t("en_grade_4") },
              ].map((x) => (
                <button key={x.g} type="button" className="hud-btn" onClick={() => void grade(x.g)}>
                  {x.g} · {x.lab}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="bridge-actions">
        <button type="button" className="hud-btn" onClick={() => void addNew()}>
          {t("en_add_10")}
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
