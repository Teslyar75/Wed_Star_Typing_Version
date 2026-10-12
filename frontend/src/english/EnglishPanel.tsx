import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { useRadio } from "../radio/radioStore";
import { useReadingPos } from "../reading/positionStore";
import EnglishOverview, { type EnProgress } from "./EnglishOverview";

type Word = { id: number; word: string; translation: string; example: string };
type Bin = "due" | "favorite" | "learned" | "inbox";
type Page = "overview" | "sets" | "scanner" | "practice" | "review" | "warehouse" | "book" | "lists" | "log" | "settings";
type Progress = EnProgress;
type LogRow = { id: number; word: string; grade: number; at: string | null };

const PAGES: { id: Page; labelKey: string }[] = [
  { id: "overview", labelKey: "en_overview" },
  { id: "sets", labelKey: "en_star_maps" },
  { id: "scanner", labelKey: "en_scanner" },
  { id: "practice", labelKey: "en_missions" },
  { id: "review", labelKey: "en_systems_check" },
  { id: "lists", labelKey: "en_lists" },
  { id: "log", labelKey: "en_log" },
  { id: "settings", labelKey: "en_settings" },
];

export default function EnglishPanel() {
  const textId = useReadingPos((s) => s.textId);
  const sentenceId = useReadingPos((s) => s.sentenceId);
  const [page, setPage] = useState<Page>("overview");
  const [bin, setBin] = useState<Bin>("due");
  const [words, setWords] = useState<Word[]>([]);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [prog, setProg] = useState<Progress | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [msg, setMsg] = useState("");
  const [scanQ, setScanQ] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookSegments, setBookSegments] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(() => localStorage.getItem("st_en_auto_speak") === "1");
  const setDuck = useRadio((s) => s.setDuck);
  const duckOnType = useRadio((s) => s.duckOnType);

  useEffect(() => {
    if (textId == null) {
      setBookTitle("");
      setBookSegments(0);
      return;
    }
    void (async () => {
      try {
        const shelf = await (await fetch("/api/library", { credentials: "include" })).json();
        const hit = Array.isArray(shelf) ? shelf.find((x: { text_id: number }) => x.text_id === textId) : null;
        if (hit) {
          setBookTitle(hit.title || `#${textId}`);
          setBookSegments(Number(hit.segments) || 0);
          return;
        }
      } catch {
        /* ignore */
      }
      setBookTitle(`#${textId}`);
      setBookSegments(0);
    })();
  }, [textId]);

  const seedBusy = useRef(false);

  /** Досев словаря порциями в фоне — UI не ждёт 20k. */
  useEffect(() => {
    let cancelled = false;
    const pump = async () => {
      if (seedBusy.current) return;
      seedBusy.current = true;
      try {
        while (!cancelled) {
          const r = await fetch("/api/english/seed?limit=20000&batch=400", {
            method: "POST",
            credentials: "include",
          });
          if (!r.ok) break;
          const j = (await r.json()) as { done?: boolean; added?: number };
          if (j.done) break;
          await new Promise((res) => setTimeout(res, 80));
        }
      } catch {
        /* ignore */
      } finally {
        seedBusy.current = false;
      }
    };
    void pump();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    const warehouseBin = page === "review" ? "due" : page === "lists" ? bin : page === "practice" ? "inbox" : bin;
    const [listRes, progRes, logRes] = await Promise.all([
      fetch(`/api/english/warehouse?limit=30&bin=${warehouseBin}`, { credentials: "include" }),
      fetch("/api/english/progress", { credentials: "include" }),
      page === "log"
        ? fetch("/api/english/log?limit=40", { credentials: "include" })
        : Promise.resolve(null),
    ]);
    setWords(await listRes.json());
    setI(0);
    setProg(await progRes.json());
    if (logRes) setLog(await logRes.json());
  }, [bin, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const w = words[i];

  const speak = () => {
    if (!w || !window.speechSynthesis) return;
    setSpeaking(true);
    if (duckOnType) setDuck(true);
    const u = new SpeechSynthesisUtterance(w.word);
    u.lang = "en-US";
    u.onend = () => {
      setSpeaking(false);
      if (duckOnType) setDuck(false);
    };
    window.speechSynthesis.speak(u);
  };

  const listen = async () => {
    if (!w) return;
    setListening(true);
    if (duckOnType) setDuck(true);
    setHeard("");
    setScore(null);
    const { listenOnce } = await import("./asr");
    const res = await listenOnce({
      expected: w.example || w.word,
      targetWord: w.word,
      onInterim: setHeard,
      onLevel: setLevel,
    });
    setListening(false);
    if (duckOnType) setDuck(false);
    setHeard(res.transcript || (res.engine === "none" ? t("asr_unavailable") : ""));
    setScore(res.engine === "none" ? null : res.score);
    setLevel(0);
  };

  const grade = async (g: number) => {
    if (!w) return;
    await fetch("/api/english/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, grade: g }),
    });
    setShow(false);
    setHeard("");
    setScore(null);
    setI((x) => (x + 1) % Math.max(words.length, 1));
    void reload();
  };

  const move = async (target: "favorite" | "learned" | "inbox") => {
    if (!w) return;
    await fetch("/api/english/move", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, bin: target }),
    });
    void reload();
  };

  const fromBook = async () => {
    if (textId == null) {
      setMsg(t("from_book_need"));
      return;
    }
    const r = await fetch("/api/english/from-book", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_id: textId, up_to_sentence_id: Math.max(sentenceId + 20, 5), limit: 24 }),
    });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    setMsg(`${t("from_book")}: ${j.cards}`);
    setBin("inbox");
    setPage("practice");
  };

  const cardUi = (
    <div className="card">
      {!w ? (
        <p className="lead">{t("vocab_loading")}</p>
      ) : (
        <>
          <h2>{show ? w.translation || w.word : w.word}</h2>
          {speaking && <span className="badge ok">{t("reading")}</span>}
          {listening && (
            <span className="badge ok">
              {t("listening")} {Math.round(level)}%
            </span>
          )}
          <div className="bridge-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="hud-btn" onClick={speak}>
              {t("voice")}
            </button>
            <button type="button" className="hud-btn" onClick={() => void listen()}>
              {t("mic")}
            </button>
            <button
              type="button"
              className="hud-btn amber"
              onClick={() => {
                setShow((s) => !s);
                if (!show && autoSpeak) speak();
              }}
            >
              {t("show")}
            </button>
            <button type="button" className="hud-btn" onClick={() => void move("favorite")}>
              ★
            </button>
          </div>
          {heard && <p className="muted">Услышано: {heard}</p>}
          {score != null && <p>Совпадение: {score}%</p>}
          {listening && (
            <div className="mic-meter" aria-hidden>
              <div style={{ width: `${level}%` }} />
            </div>
          )}
          {show && (
            <>
              <p className="muted">{w.example}</p>
              <div className="bridge-actions">
                {[1, 2, 3, 4].map((g) => (
                  <button key={g} type="button" className="hud-btn" onClick={() => void grade(g)}>
                    {g}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  const runScan = () => {
    const q = scanQ.trim().toLowerCase();
    if (!q) {
      setPage("scanner");
      return;
    }
    const hit = words.find((x) => x.word.toLowerCase() === q || x.word.toLowerCase().startsWith(q));
    if (hit) {
      setWords([hit, ...words.filter((x) => x.id !== hit.id)]);
      setI(0);
      setPage("scanner");
      setShow(false);
    } else {
      setPage("scanner");
      setMsg(`${t("en_scan")}: ${q}`);
    }
  };

  return (
    <div className="english">
      <div className="en-nav-row">
        <div className="bridge-actions en-nav">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`hud-btn ${page === p.id ? "amber" : ""}`}
              onClick={() => setPage(p.id)}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
        <form
          className="en-scan-form"
          onSubmit={(e) => {
            e.preventDefault();
            runScan();
          }}
        >
          <input
            className="en-scan-input"
            value={scanQ}
            onChange={(e) => setScanQ(e.target.value)}
            placeholder={t("en_scan_ph")}
            aria-label={t("en_scan")}
          />
        </form>
      </div>
      {msg && <p className="muted">{msg}</p>}

      {page === "overview" && prog && (
        <EnglishOverview
          prog={prog}
          book={
            textId != null
              ? {
                  title: bookTitle || `#${textId}`,
                  meta: t("en_book_meta")
                    .replace("{0}", String(Math.max(0, sentenceId)))
                    .replace("{1}", String(bookSegments || "—")),
                  sample: t("en_book_sample_ready"),
                  hasBook: true,
                }
              : {
                  title: t("en_book_none"),
                  meta: t("en_book_none_hint"),
                  sample: "",
                  hasBook: false,
                }
          }
          onStartLesson={() => setPage("review")}
          onQuickMission={() => {
            setBin("inbox");
            setPage("practice");
          }}
          onFromBook={() => setPage("book")}
          onFormBook={() => void fromBook()}
          onPracticeBook={() => {
            setBin("inbox");
            setPage("practice");
          }}
          onOpenBookSection={() => setPage("book")}
          onScanWord={(word) => {
            setScanQ(word);
            setPage("scanner");
            const hit = words.find((x) => x.word.toLowerCase() === word.toLowerCase());
            if (hit) {
              setWords([hit, ...words.filter((x) => x.id !== hit.id)]);
              setI(0);
            }
          }}
        />
      )}

      {(page === "sets" || page === "scanner") && (
        <div className="panel-inset">
          <p className="muted">{page === "sets" ? t("en_sets_soon") : t("en_scanner_hint")}</p>
          {page === "scanner" && cardUi}
        </div>
      )}

      {(page === "practice" || page === "review" || page === "warehouse") && (
        <>
          {page === "warehouse" && (
            <div className="bridge-actions">
              {(["due", "inbox", "favorite", "learned"] as Bin[]).map((b) => (
                <button key={b} type="button" className={`hud-btn ${bin === b ? "amber" : ""}`} onClick={() => setBin(b)}>
                  {t(`bin_${b}`)}
                </button>
              ))}
            </div>
          )}
          {cardUi}
        </>
      )}

      {page === "book" && (
        <div>
          <p className="muted">
            {textId != null
              ? `${t("from_book_pos")}: #${textId} · s${sentenceId}`
              : t("from_book_need")}
          </p>
          <button type="button" className="hud-btn amber" onClick={() => void fromBook()} disabled={textId == null}>
            {t("from_book")}
          </button>
        </div>
      )}

      {page === "lists" && (
        <>
          <div className="bridge-actions">
            {(["inbox", "favorite", "learned"] as Bin[]).map((b) => (
              <button key={b} type="button" className={`hud-btn ${bin === b ? "amber" : ""}`} onClick={() => setBin(b)}>
                {t(`bin_${b}`)}
              </button>
            ))}
          </div>
          <ul className="mission-list">
            {words.map((x) => (
              <li key={x.id}>
                <strong>{x.word}</strong> <span className="muted">{x.translation}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {page === "log" && (
        <ul className="mission-list">
          {log.map((r) => (
            <li key={r.id}>
              {r.word} · grade {r.grade} <span className="muted">{r.at}</span>
            </li>
          ))}
          {!log.length && <li className="muted">{t("en_log_empty")}</li>}
        </ul>
      )}

      {page === "settings" && (
        <label className="muted">
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(e) => {
              setAutoSpeak(e.target.checked);
              localStorage.setItem("st_en_auto_speak", e.target.checked ? "1" : "0");
            }}
          />{" "}
          {t("en_auto_speak")}
        </label>
      )}
    </div>
  );
}
