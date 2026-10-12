import { useEffect, useRef, useState } from "react";
import { msPerWord } from "./timing";
import { t } from "../i18n";
import { makeQuiz, type QuizItem } from "./quiz";
import { buildPyramid } from "./epyr";
import { gorbovSequence, shuffleGorbovGrid } from "./gorbov";
import { useReadingPos } from "../reading/positionStore";
import SpeedOverview, { type SrBook, type SrSession, type SrTrainer } from "./SpeedOverview";

type Page = "overview" | "reader" | "book" | "trainers" | "library" | "journal" | "settings";
type Mode = "rsvp" | "schulte" | "gorbov" | "quiz" | "tachi" | "epyr" | "ramp";

type JournalRow = SrSession;

function orpIndex(word: string) {
  if (word.length <= 1) return 0;
  if (word.length <= 5) return 1;
  if (word.length <= 9) return 2;
  return 3;
}

const RAMP_KEY = "st_speed_ramp";
const TARGET_WPM = 600;

const TRAINERS: SrTrainer[] = [
  { code: "E-SHL", title: "Таблица Шульте", desc: "Числа или буквы по порядку, 3×3…7×7", ready: true, best: "—" },
  { code: "E-GRB", title: "Таблица Горбова", desc: "Чёрные ↑ и красные ↓ поочерёдно", ready: true, best: "—" },
  { code: "E-PYR", title: "Пирамида", desc: "Расширение поля зрения по клину", ready: true, best: "—" },
  { code: "E-TAC", title: "Вспышка", desc: "Тахистоскоп: слова на 50–300 мс", ready: true, best: "—" },
  { code: "E-FND", title: "Поиск слов", desc: "Найди заданные слова в тексте", ready: false, best: "" },
  { code: "E-GAP", title: "Пропущенные буквы", desc: "Прочти слова с пропусками", ready: false, best: "" },
  { code: "E-EYE", title: "Глазодвигатель", desc: "Точки-мишени, саккады", ready: false, best: "" },
  { code: "E-PCR", title: "Указка", desc: "Ведущая строка без возвратов", ready: false, best: "" },
];

function loadRampPreset() {
  try {
    const j = JSON.parse(localStorage.getItem(RAMP_KEY) || "{}");
    return {
      start: Number(j.start) || 200,
      target: Number(j.target) || 500,
      wordsPerStep: Number(j.wordsPerStep) || 8,
    };
  } catch {
    return { start: 200, target: 500, wordsPerStep: 8 };
  }
}

export default function SpeedReadPanel() {
  const textId = useReadingPos((s) => s.textId);
  const sentenceId = useReadingPos((s) => s.sentenceId);
  const [page, setPage] = useState<Page>("overview");
  const [text, setText] = useState("Star Typing teaches you to read faster and type with rhythm.");
  const [wpm, setWpm] = useState(300);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);
  const [mode, setMode] = useState<Mode>("rsvp");
  const [msg, setMsg] = useState("");
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [schulte, setSchulte] = useState(() =>
    Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5),
  );
  const [nextNum, setNextNum] = useState(1);
  const [gorbovN] = useState(5);
  const [gorbovGrid, setGorbovGrid] = useState(() => shuffleGorbovGrid(5));
  const [gorbovStep, setGorbovStep] = useState(0);
  const [flash, setFlash] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [pyrLevel, setPyrLevel] = useState(0);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [filterMode, setFilterMode] = useState("");
  const [ramp, setRamp] = useState(loadRampPreset);
  const [liveWpm, setLiveWpm] = useState(200);
  const [bookMeta, setBookMeta] = useState<{ title: string; segments: number } | null>(null);
  const [pilotXp, setPilotXp] = useState(0);
  const words = text.split(/\s+/).filter(Boolean);
  const pyramid = buildPyramid(text, 8);
  const gorbovOrder = gorbovSequence(gorbovN);
  const raf = useRef(0);
  const last = useRef(0);
  const started = useRef(0);

  const pages: { id: Page; label: string }[] = [
    { id: "overview", label: t("sr_overview") },
    { id: "reader", label: t("hyperdrive") },
    { id: "book", label: t("sr_book") },
    { id: "trainers", label: t("sr_trainers_tab") },
    { id: "library", label: t("library") },
    { id: "journal", label: t("journal") },
    { id: "settings", label: t("settings") },
  ];

  const saveResult = async (payload: {
    mode: string;
    wpm: number;
    words: number;
    elapsed: number;
    score: number;
  }) => {
    const r = await fetch("/api/speedread/results", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg(t("result_saved"));
      void loadJournal();
    }
  };

  const loadJournal = async (m?: string) => {
    const q = m ? `?mode=${encodeURIComponent(m)}&limit=40` : "?limit=40";
    const rows = await (await fetch(`/api/speedread/results${q}`, { credentials: "include" })).json();
    setJournal(Array.isArray(rows) ? rows : []);
  };

  const loadFromShelf = async () => {
    if (!textId) {
      setMsg(t("from_book_need"));
      return;
    }
    const r = await fetch(`/api/reader/${textId}/bilingual?offset=${sentenceId}&limit=40`, { credentials: "include" });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const segs = (await r.json()) as { original?: string }[];
    const body = segs.map((s) => s.original || "").filter(Boolean).join(" ");
    if (body) {
      setText(body);
      setMsg(`${t("from_shelf")} · s${sentenceId}`);
    }
  };

  useEffect(() => {
    void loadJournal();
    void (async () => {
      try {
        const me = await fetch("/api/pilots/me", { credentials: "include" });
        if (me.ok) {
          const j = await me.json();
          setPilotXp(Number(j.xp) || 0);
        }
      } catch {
        /* guest */
      }
    })();
  }, []);

  useEffect(() => {
    if (textId == null) {
      setBookMeta(null);
      return;
    }
    void (async () => {
      try {
        const shelf = await (await fetch("/api/library", { credentials: "include" })).json();
        const hit = Array.isArray(shelf) ? shelf.find((x: { text_id: number }) => x.text_id === textId) : null;
        if (hit) setBookMeta({ title: hit.title || `#${textId}`, segments: Number(hit.segments) || 0 });
        else setBookMeta({ title: `#${textId}`, segments: 0 });
      } catch {
        setBookMeta({ title: `#${textId}`, segments: 0 });
      }
    })();
  }, [textId]);

  useEffect(() => {
    if (!run || (mode !== "rsvp" && mode !== "ramp")) return;
    const effective = mode === "ramp" ? liveWpm : wpm;
    const ms = msPerWord(effective);
    if (!started.current) started.current = performance.now();
    const loop = (t0: number) => {
      if (t0 - last.current >= ms) {
        last.current = t0;
        setI((x) => {
          if (mode === "ramp" && x > 0 && x % ramp.wordsPerStep === 0) {
            setLiveWpm((w) => Math.min(ramp.target, w + Math.max(10, Math.round((ramp.target - ramp.start) / 10))));
          }
          if (x + 1 >= words.length) {
            setRun(false);
            const elapsed = (performance.now() - started.current) / 1000;
            void saveResult({
              mode: mode === "ramp" ? "ramp" : "rsvp",
              wpm: effective,
              words: words.length,
              elapsed,
              score: effective,
            });
            const items = makeQuiz(text, "en");
            if (items.length && mode === "rsvp") {
              setQuiz(items);
              setQi(0);
              setScore(0);
              setMode("quiz");
            }
            started.current = 0;
            return x;
          }
          return x + 1;
        });
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [run, wpm, liveWpm, mode, words.length, ramp, text]);

  useEffect(() => {
    if (!run || mode !== "tachi") return;
    let cancelled = false;
    let idx = 0;
    started.current = performance.now();
    const tick = () => {
      if (cancelled) return;
      if (idx >= words.length) {
        setRun(false);
        setFlashOn(false);
        const elapsed = (performance.now() - started.current) / 1000;
        void saveResult({ mode: "tachi", wpm, words: words.length, elapsed, score: wpm });
        return;
      }
      setFlash(words[idx]!);
      setFlashOn(true);
      window.setTimeout(() => {
        if (cancelled) return;
        setFlashOn(false);
        idx += 1;
        window.setTimeout(tick, Math.max(200, msPerWord(wpm)));
      }, 120);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [run, mode, wpm, words]);

  useEffect(() => {
    if (!run || mode !== "epyr") return;
    let cancelled = false;
    let level = 0;
    started.current = performance.now();
    setPyrLevel(0);
    const step = () => {
      if (cancelled) return;
      if (level >= pyramid.length) {
        setRun(false);
        const elapsed = (performance.now() - started.current) / 1000;
        void saveResult({ mode: "epyr", wpm, words: pyramid.length, elapsed, score: pyramid.length });
        return;
      }
      setPyrLevel(level);
      level += 1;
      window.setTimeout(step, Math.max(400, msPerWord(Math.max(120, wpm / 2))));
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [run, mode, wpm, pyramid.length]);

  useEffect(() => {
    if (page === "journal") void loadJournal(filterMode || undefined);
  }, [page, filterMode]);

  const word = words[i] || "";
  const oi = orpIndex(word);

  const onSchulte = (n: number) => {
    if (n !== nextNum) return;
    if (nextNum === 1) started.current = performance.now();
    if (nextNum >= 25) {
      const elapsed = (performance.now() - started.current) / 1000;
      void saveResult({ mode: "schulte", wpm: 0, words: 25, elapsed, score: elapsed });
      setNextNum(1);
      setSchulte(Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5));
      started.current = 0;
      return;
    }
    setNextNum((x) => x + 1);
  };

  const onGorbov = (cell: { color: "b" | "r"; value: number }) => {
    const expect = gorbovOrder[gorbovStep];
    if (!expect || expect.color !== cell.color || expect.value !== cell.value) return;
    if (gorbovStep === 0) started.current = performance.now();
    if (gorbovStep + 1 >= gorbovOrder.length) {
      const elapsed = (performance.now() - started.current) / 1000;
      void saveResult({ mode: "gorbov", wpm: 0, words: gorbovOrder.length, elapsed, score: elapsed });
      setGorbovStep(0);
      setGorbovGrid(shuffleGorbovGrid(gorbovN));
      started.current = 0;
      return;
    }
    setGorbovStep((x) => x + 1);
  };

  const openTrainer = (code: string) => {
    setPage("trainers");
    setRun(false);
    if (code === "E-SHL") {
      setMode("schulte");
      setNextNum(1);
      setSchulte(Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5));
    } else if (code === "E-GRB") {
      setMode("gorbov");
      setGorbovStep(0);
      setGorbovGrid(shuffleGorbovGrid(gorbovN));
    } else if (code === "E-PYR") {
      setMode("epyr");
    } else if (code === "E-TAC") {
      setMode("tachi");
    }
  };

  const book: SrBook =
    textId != null
      ? {
          title: bookMeta?.title || `#${textId}`,
          status: t("sr_original"),
          lang: "en",
          readWord: Math.max(0, sentenceId),
          totalWords: Math.max(bookMeta?.segments || 0, sentenceId + 1),
          typeWord: null,
          startWpm: wpm,
          hasBook: true,
        }
      : {
          title: t("sr_lib_empty"),
          status: "",
          lang: "en",
          readWord: 0,
          totalWords: 0,
          typeWord: null,
          startWpm: wpm,
          hasBook: false,
        };

  const wpmRows = journal.filter((r) => r.wpm > 0);
  const recordWpm = wpmRows.length ? Math.round(Math.max(...wpmRows.map((r) => r.wpm))) : null;
  const effWpm = wpmRows.length ? Math.round(wpmRows[0]!.wpm) : null;

  const chartPoints = journal
    .filter((r) => r.wpm > 0)
    .slice(0, 20)
    .reverse()
    .map((r) => r.wpm);
  const maxW = Math.max(100, ...chartPoints);

  return (
    <div className="speed sr-hub">
      <header className="sr-hub-head">
        <h2 className="route-title">{t("speed")}</h2>
        <nav className="tabs sr-subs" aria-label={t("speed")}>
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tab ${page === p.id ? "on" : ""}`}
              onClick={() => {
                setPage(p.id);
                setRun(false);
                if (p.id === "reader") setMode("rsvp");
              }}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>
      {msg && <p className="muted">{msg}</p>}

      {page === "overview" && (
        <SpeedOverview
          book={book}
          sessions={journal}
          targetWpm={TARGET_WPM}
          recordWpm={recordWpm}
          effWpm={effWpm}
          streak={0}
          xp={pilotXp}
          trainers={TRAINERS}
          onHyperdrive={() => {
            setPage("reader");
            setMode("rsvp");
            void loadFromShelf();
          }}
          onBook={() => setPage("book")}
          onLibrary={() => setPage("library")}
          onTrainer={openTrainer}
        />
      )}

      {page === "reader" && (
        <div className="sr-reader">
          <div className="bridge-actions">
            {(
              [
                ["rsvp", t("hyperdrive")],
                ["ramp", t("ramp")],
                ["quiz", t("quiz")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`hud-btn ${mode === id ? "amber" : ""}`}
                onClick={() => {
                  setMode(id);
                  setRun(false);
                  if (id === "quiz") {
                    const items = makeQuiz(text, "en");
                    setQuiz(items);
                    setQi(0);
                    setScore(0);
                  }
                  if (id === "ramp") setLiveWpm(ramp.start);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "quiz" ? (
            quiz.length === 0 ? (
              <p className="muted">{t("quiz_need_text")}</p>
            ) : qi >= quiz.length ? (
              <p>
                {score}/{quiz.length}
              </p>
            ) : (
              <div className="quiz">
                <p>{quiz[qi]!.question}</p>
                <div className="bridge-actions">
                  {quiz[qi]!.options.map((opt, oi2) => (
                    <button
                      key={opt}
                      type="button"
                      className="hud-btn amber"
                      onClick={() => {
                        if (oi2 === quiz[qi]!.answer) setScore((s) => s + 1);
                        setQi((x) => x + 1);
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <>
              <textarea className="cargo-input sr-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="bridge-actions">
                <button type="button" className="hud-btn" onClick={() => void loadFromShelf()}>
                  {t("from_shelf")}
                </button>
                {mode === "ramp" ? (
                  <>
                    <label>
                      {t("ramp")} {ramp.start}→
                      <input
                        type="number"
                        value={ramp.target}
                        min={150}
                        max={1200}
                        onChange={(e) => {
                          const next = { ...ramp, target: Number(e.target.value) };
                          setRamp(next);
                          localStorage.setItem(RAMP_KEY, JSON.stringify(next));
                        }}
                      />
                    </label>
                    <span className="muted">{Math.round(liveWpm)} WPM</span>
                  </>
                ) : (
                  <label>
                    WPM{" "}
                    <input type="number" value={wpm} min={100} max={1200} onChange={(e) => setWpm(Number(e.target.value))} />
                  </label>
                )}
                <button
                  type="button"
                  className="hud-btn amber"
                  onClick={() => {
                    setI(0);
                    started.current = 0;
                    setMsg("");
                    if (mode === "ramp") setLiveWpm(ramp.start);
                    setRun(true);
                  }}
                >
                  {t("start")}
                </button>
                <button type="button" className="hud-btn" onClick={() => setRun(false)}>
                  {t("pause")}
                </button>
              </div>
              {(mode === "rsvp" || mode === "ramp") && (
                <div className="rsvp">
                  <span>{word.slice(0, oi)}</span>
                  <span className="orp">{word[oi] ?? ""}</span>
                  <span>{word.slice(oi + 1)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {page === "book" && (
        <div className="panel-inset">
          <p className="muted">{book.hasBook ? book.title : t("sr_lib_empty_hint")}</p>
          <button type="button" className="hud-btn amber" disabled={!book.hasBook} onClick={() => setPage("reader")}>
            ▶ {t("hyperdrive")}
          </button>
        </div>
      )}

      {page === "trainers" && (
        <div className="sr-trainers-page">
          <div className="bridge-actions">
            {(
              [
                ["schulte", t("schulte")],
                ["gorbov", t("gorbov")],
                ["epyr", t("epyr")],
                ["tachi", t("tachi")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`hud-btn ${mode === id ? "amber" : ""}`}
                onClick={() => openTrainer(id === "schulte" ? "E-SHL" : id === "gorbov" ? "E-GRB" : id === "epyr" ? "E-PYR" : "E-TAC")}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "schulte" && (
            <>
              <p className="muted">
                {t("next_num")}: {nextNum}
              </p>
              <div className="schulte">
                {schulte.map((n) => (
                  <button key={n} type="button" className="schulte-cell" onClick={() => onSchulte(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === "gorbov" && (
            <>
              <p className="muted">
                {gorbovOrder[gorbovStep]
                  ? `${gorbovOrder[gorbovStep]!.color === "b" ? "●" : "○"} ${gorbovOrder[gorbovStep]!.value}`
                  : "OK"}
              </p>
              <div className="schulte gorbov" style={{ gridTemplateColumns: `repeat(${gorbovN}, 1fr)` }}>
                {gorbovGrid.map((cell, idx) => (
                  <button
                    key={`${cell.color}-${cell.value}-${idx}`}
                    type="button"
                    className="schulte-cell"
                    style={{ color: cell.color === "r" ? "#e05050" : "#e8e8e8", fontWeight: 700 }}
                    onClick={() => onGorbov(cell)}
                  >
                    {cell.value}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === "tachi" && (
            <>
              <div className="bridge-actions">
                <button type="button" className="hud-btn amber" onClick={() => setRun(true)}>
                  {t("start")}
                </button>
                <button type="button" className="hud-btn" onClick={() => setRun(false)}>
                  {t("pause")}
                </button>
              </div>
              <div className={`rsvp tachi ${flashOn ? "on" : ""}`}>{flashOn ? flash : "·"}</div>
            </>
          )}
          {mode === "epyr" && (
            <>
              <div className="bridge-actions">
                <button type="button" className="hud-btn amber" onClick={() => setRun(true)}>
                  {t("start")}
                </button>
                <button type="button" className="hud-btn" onClick={() => setRun(false)}>
                  {t("pause")}
                </button>
              </div>
              <div className="epyr">
                {pyramid.slice(0, pyrLevel + 1).map((line, li) => (
                  <div key={li} className="epyr-line">
                    {line}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {page === "library" && (
        <div className="panel-inset">
          <p className="muted">{t("sr_lib_hint")}</p>
          <button type="button" className="hud-btn" onClick={() => void loadFromShelf()}>
            {t("from_shelf")}
          </button>
        </div>
      )}

      {page === "journal" && (
        <>
          <div className="bridge-actions">
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
              <option value="">{t("all_modes")}</option>
              <option value="rsvp">RSVP</option>
              <option value="ramp">Ramp</option>
              <option value="tachi">Tachi</option>
              <option value="epyr">E-Pyr</option>
              <option value="schulte">Schulte</option>
              <option value="gorbov">Gorbov</option>
            </select>
          </div>
          {chartPoints.length > 1 && (
            <svg viewBox="0 0 200 60" className="speed-chart" style={{ width: "100%", height: 60 }}>
              <polyline
                fill="none"
                stroke="var(--amber, #f0a030)"
                strokeWidth="2"
                points={chartPoints
                  .map((w, idx) => `${(idx / (chartPoints.length - 1)) * 200},${60 - (w / maxW) * 55}`)
                  .join(" ")}
              />
            </svg>
          )}
          <table className="honor">
            <thead>
              <tr>
                <th>mode</th>
                <th>wpm</th>
                <th>words</th>
                <th>s</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((r) => (
                <tr key={r.id}>
                  <td>{r.mode}</td>
                  <td>{Math.round(r.wpm)}</td>
                  <td>{r.words}</td>
                  <td>{r.elapsed.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {page === "settings" && (
        <div className="panel-inset">
          <label>
            {t("sr_target_wpm")}{" "}
            <input type="number" value={TARGET_WPM} disabled readOnly />
          </label>
          <p className="muted">{t("sr_settings_hint")}</p>
        </div>
      )}
    </div>
  );
}
