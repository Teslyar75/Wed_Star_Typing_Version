import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import { makeQuiz, type QuizItem } from "./quiz";
import { useReadingPos } from "../reading/positionStore";
import { registerGoHandler, setDeepRoute } from "../shell/routeStore";
import SpeedOverview, { type SrBook, type SrSession, type SrTrainer } from "./SpeedOverview";
import HyperdriveView from "./HyperdriveView";
import BookReaderView from "./BookReaderView";
import TableExView from "./TableExView";
import PyramidExView from "./PyramidExView";
import FlashExView from "./FlashExView";
import { tokenize } from "./rsvpCore";
import {
  collectFrameKeys,
  ensureBootBuffer,
  getTrStore,
  RSVP_PREWARM,
  warmAheadTail,
} from "./trCache";
import {
  loadSpeedPrefs,
  resolveStartWpm,
  saveLastWpm,
  saveSpeedPrefs,
  type SpeedPrefs,
} from "./speedPrefs";

const LibraryPanel = lazy(() => import("../library/LibraryPanel"));

type Page = "overview" | "reader" | "book" | "trainers" | "library" | "journal" | "settings";
type Mode = "rsvp" | "schulte" | "gorbov" | "quiz" | "tachi" | "epyr" | "ramp";

type JournalRow = SrSession;

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

function Stepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="sr-set-row">
      <span>{label}</span>
      <span className="sr-stepper">
        <button type="button" className="hud-btn" onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <strong>
          {value} <span className="muted">{unit}</span>
        </strong>
        <button type="button" className="hud-btn" onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </span>
    </label>
  );
}

type SpeedProps = {
  onOpenBridge?: () => void;
};

export default function SpeedReadPanel({ onOpenBridge }: SpeedProps) {
  const textId = useReadingPos((s) => s.textId);
  const sentenceId = useReadingPos((s) => s.sentenceId);
  const [page, setPage] = useState<Page>("overview");
  const [text, setText] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [wpm] = useState(300);
  const [mode, setMode] = useState<Mode>("rsvp");
  const [msg, setMsg] = useState("");
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [filterMode, setFilterMode] = useState("");
  const [prefs, setPrefs] = useState<SpeedPrefs>(loadSpeedPrefs);

  const patchPrefs = (patch: Partial<SpeedPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      saveSpeedPrefs(next);
      return next;
    });
  };
  const [bookMeta, setBookMeta] = useState<{ title: string; segments: number } | null>(null);
  const [pilotXp, setPilotXp] = useState(0);

  const pages: { id: Page; label: string }[] = [
    { id: "overview", label: t("sr_overview") },
    { id: "reader", label: t("hyperdrive") },
    { id: "book", label: t("sr_book") },
    { id: "trainers", label: t("sr_trainers_tab") },
    { id: "library", label: t("library") },
    { id: "journal", label: t("journal") },
    { id: "settings", label: t("settings") },
  ];

  useEffect(() => {
    const meta = pages.find((p) => p.id === page);
    setDeepRoute([{ slug: page, label: meta?.label || page }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels from t() at render
  }, [page]);

  useEffect(() => {
    registerGoHandler((slugs) => {
      const id = slugs[0] as Page | undefined;
      if (!id || !pages.some((p) => p.id === id)) return;
      if (id === "reader") {
        void openHyperdrive();
        return;
      }
      if (id === "book") {
        void openBook();
        return;
      }
      setPage(id);
      if (id === "trainers") setMode("rsvp");
    });
    return () => registerGoHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

  const loadBookContent = useCallback(
    async (id?: number | null): Promise<string | null> => {
      const tid = id ?? textId;
      if (tid == null) {
        setBookReady(false);
        setMsg(t("from_book_need"));
        return null;
      }
      const r = await fetch(`/api/texts/${tid}/content`, { credentials: "include" });
      if (!r.ok) {
        setMsg(await r.text());
        setBookReady(false);
        return null;
      }
      const j = (await r.json()) as { title?: string; body?: string; chars?: number };
      const body = (j.body || "").trim();
      if (!body) {
        setMsg(t("from_book_need"));
        setBookReady(false);
        return null;
      }
      setText(body);
      setBookMeta({ title: j.title || `#${tid}`, segments: Math.max(1, Math.round((j.chars || body.length) / 5)) });
      setBookReady(true);
      setMsg(`${t("from_shelf")}: ${j.title || tid}`);
      /* как book_reader._warm_book_translation: запас до входа в гипердрайв */
      const words = tokenize(body);
      const store = getTrStore();
      const keys = collectFrameKeys(words, 0, 1, RSVP_PREWARM);
      void store.warm(keys).then(() => warmAheadTail(store, words, 0, 1, RSVP_PREWARM));
      return body;
    },
    [textId],
  );

  /** Как desktop show(): active_reading или первая книга на полке. */
  const resolveShelfBook = useCallback(async (): Promise<{ textId: number; sentenceId: number } | null> => {
    const cur = useReadingPos.getState().textId;
    try {
      const shelf = await (await fetch("/api/library", { credentials: "include" })).json();
      if (!Array.isArray(shelf) || shelf.length === 0) return null;
      type Row = { text_id: number; sentence_id?: number };
      const rows = shelf as Row[];
      const hit = cur != null ? rows.find((x) => x.text_id === cur) : undefined;
      const pick = hit ?? rows[0];
      if (!pick) return null;
      if (cur !== pick.text_id) {
        useReadingPos.getState().jump(pick.text_id, Number(pick.sentence_id) || 0, "reader");
      }
      return { textId: pick.text_id, sentenceId: Number(pick.sentence_id) || 0 };
    } catch {
      return cur != null ? { textId: cur, sentenceId: useReadingPos.getState().sentenceId } : null;
    }
  }, []);

  const openHyperdrive = useCallback(async () => {
    const picked = await resolveShelfBook();
    if (!picked) {
      setMsg(t("sr_lib_empty"));
      setPage("library");
      return;
    }
    let body =
      bookReady && text.trim().length > 0 && textId === picked.textId ? text : null;
    if (!body) body = await loadBookContent(picked.textId);
    if (!body) {
      setPage("library");
      return;
    }
    /* буфер должен уже стоять — ждём покрытие первых кадров, потом вход */
    const words = tokenize(body);
    if (words.length) {
      setMsg("Uplink…");
      await ensureBootBuffer(getTrStore(), words, 0, 1);
    }
    setMode("rsvp");
    setPage("reader");
  }, [bookReady, text, textId, loadBookContent, resolveShelfBook]);

  const openBook = useCallback(async () => {
    const picked = await resolveShelfBook();
    if (!picked) {
      setMsg(t("sr_lib_empty"));
      setPage("library");
      return;
    }
    const body =
      bookReady && text.trim().length > 0 && textId === picked.textId
        ? text
        : await loadBookContent(picked.textId);
    if (!body) {
      setPage("library");
      return;
    }
    setPage("book");
  }, [bookReady, text, textId, loadBookContent, resolveShelfBook]);

  useEffect(() => {
    if (textId != null) {
      void loadBookContent(textId);
      return;
    }
    /* обзор при пустом textId — как desktop refresh: первая с полки */
    void (async () => {
      const picked = await resolveShelfBook();
      if (picked) void loadBookContent(picked.textId);
    })();
  }, [textId, loadBookContent, resolveShelfBook]);

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
    if (page === "journal") void loadJournal(filterMode || undefined);
  }, [page, filterMode]);

  const openTrainer = (code: string) => {
    setPage("trainers");
    if (code === "E-SHL") setMode("schulte");
    else if (code === "E-GRB") setMode("gorbov");
    else if (code === "E-PYR") setMode("epyr");
    else if (code === "E-TAC") setMode("tachi");
  };

  const trainersLobby = page === "trainers" && mode !== "schulte" && mode !== "gorbov" && mode !== "epyr" && mode !== "tachi";

  const book: SrBook =
    textId != null && bookReady
      ? {
          title: bookMeta?.title || `#${textId}`,
          status: t("sr_original"),
          lang: "en",
          readWord: Math.max(0, sentenceId),
          totalWords: Math.max(bookMeta?.segments || 0, text.split(/\s+/).filter(Boolean).length, sentenceId + 1),
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
                if (p.id === "reader") {
                  void openHyperdrive();
                  return;
                }
                if (p.id === "book") {
                  void openBook();
                  return;
                }
                setPage(p.id);
                if (p.id === "trainers") setMode("rsvp");
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
          targetWpm={prefs.target}
          recordWpm={recordWpm}
          effWpm={effWpm}
          streak={0}
          xp={pilotXp}
          trainers={TRAINERS}
          onHyperdrive={() => void openHyperdrive()}
          onBook={() => void openBook()}
          onLibrary={() => setPage("library")}
          onTrainer={openTrainer}
        />
      )}

      {page === "reader" && (mode === "rsvp" || mode === "ramp") && bookReady && text.trim() && (
        <HyperdriveView
          text={text}
          textId={textId}
          title={bookMeta?.title || t("hyperdrive")}
          startWpm={resolveStartWpm(prefs, textId)}
          targetWpm={prefs.target}
          rampStep={prefs.step}
          rampEveryS={prefs.everyS}
          rampMode={prefs.mode}
          punctPauses={prefs.punctPauses}
          wordsPerFrame={prefs.wordsPerFrame}
          fontPtInit={prefs.fontPt}
          orpInit={prefs.orp}
          guidesInit={prefs.guides}
          translate={prefs.translate}
          onExit={() => {
            setPage("overview");
          }}
          onOpenBook={() => setPage("book")}
          onOpenLibrary={() => setPage("library")}
          onWpmPersist={(w) => saveLastWpm(textId, w)}
          onFinished={(stats) => {
            saveLastWpm(textId, stats.wpm);
            void saveResult({
              mode: prefs.mode !== "off" && stats.wpm > prefs.start ? "ramp" : "rsvp",
              wpm: stats.wpm,
              words: stats.words,
              elapsed: stats.elapsed,
              score: stats.wpm,
            });
            const items = makeQuiz(text, "en");
            if (items.length) {
              setQuiz(items);
              setQi(0);
              setScore(0);
              setMode("quiz");
            }
          }}
        />
      )}
      {page === "reader" && (mode === "rsvp" || mode === "ramp") && !(bookReady && text.trim()) && (
        <div className="panel-inset">
          <p className="muted">{t("from_book_need")}</p>
          <button type="button" className="hud-btn amber" onClick={() => setPage("library")}>
            {t("library")}
          </button>
        </div>
      )}

      {page === "reader" && mode === "quiz" && (
        <div className="sr-reader">
          <div className="bridge-actions">
            <button type="button" className="hud-btn" onClick={() => setMode("rsvp")}>
              ← {t("hyperdrive")}
            </button>
          </div>
          {quiz.length === 0 ? (
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
          )}
        </div>
      )}

      {page === "book" && (
        <div className="sr-book-page">
          {!book.hasBook || !text.trim() ? (
            <div className="panel-inset">
              <p className="muted">{t("sr_lib_empty_hint")}</p>
              <button type="button" className="hud-btn amber" onClick={() => setPage("library")}>
                {t("library")}
              </button>
            </div>
          ) : (
            <BookReaderView
              text={text}
              title={book.title || t("sr_book")}
              textId={textId}
              fontPt={prefs.bookFontPt}
              mode={prefs.bookMode}
              theme={prefs.bookTheme}
              onFontPt={(n) => patchPrefs({ bookFontPt: n })}
              onMode={(m) => patchPrefs({ bookMode: m })}
              onTheme={(th) => patchPrefs({ bookTheme: th })}
              onLibrary={() => setPage("library")}
              onHyperdrive={() => void openHyperdrive()}
              onCards={
                textId == null
                  ? undefined
                  : () => {
                      void (async () => {
                        const r = await fetch("/api/english/from-book", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            text_id: textId,
                            up_to_sentence_id: Math.max(sentenceId + 40, 10),
                            limit: 24,
                          }),
                        });
                        if (r.ok) {
                          const j = (await r.json()) as { cards?: number };
                          setMsg(`${t("from_book")}: ${j.cards ?? 0}`);
                        }
                      })();
                    }
              }
            />
          )}
        </div>
      )}

      {page === "trainers" && (mode === "schulte" || mode === "gorbov") && (
        <TableExView
          gorbov={mode === "gorbov"}
          onExit={() => setMode("rsvp")}
          onResult={(payload) => void saveResult(payload)}
        />
      )}

      {page === "trainers" && mode === "epyr" && (
        <PyramidExView
          onExit={() => setMode("rsvp")}
          onResult={(payload) => void saveResult(payload)}
        />
      )}

      {page === "trainers" && mode === "tachi" && (
        <FlashExView
          bookText={text}
          onExit={() => setMode("rsvp")}
          onResult={(payload) => void saveResult(payload)}
        />
      )}

      {page === "trainers" && trainersLobby && (
        <div className="sr-trainers-page">
          <h3 className="sr-trainers-title">{t("sr_trainers")}</h3>
          <p className="muted">{t("sr_trainers_blurb")}</p>
          <div className="sr-trainers">
            {TRAINERS.map((tr) => (
              <button
                key={tr.code}
                type="button"
                className={`sr-trainer${tr.ready ? " ready" : " soon"}`}
                disabled={!tr.ready}
                onClick={() => openTrainer(tr.code)}
              >
                <span className="sr-tr-code">{tr.code}</span>
                <span className="sr-tr-title">{tr.title}</span>
                <span className="sr-tr-desc">{tr.desc}</span>
                {tr.ready ? (
                  <span className="sr-tr-best">
                    {t("sr_best")}: {tr.best}
                  </span>
                ) : (
                  <span className="sr-tr-best">{t("sr_wip")}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {page === "library" && (
        <Suspense fallback={<p className="muted">…</p>}>
          <LibraryPanel
            onOpenHyperdrive={() => {
              void (async () => {
                const tid = useReadingPos.getState().textId;
                const ok = await loadBookContent(tid);
                if (ok) setPage("reader");
              })();
            }}
            onOpenBook={() => {
              void (async () => {
                const tid = useReadingPos.getState().textId;
                const ok = await loadBookContent(tid);
                if (ok) setPage("book");
              })();
            }}
            onOpenBridge={onOpenBridge}
          />
        </Suspense>
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
        <div className="sr-settings" data-nav-group="sr-settings">
          <p className="muted sr-settings-hint">{t("sr_settings_hint")}</p>
          <div className="sr-settings-grid">
            <section className="panel-inset sr-set-panel">
              <h3 className="route-title">{t("sr_speed_ramp")}</h3>
              <Stepper
                label={t("sr_start_speed")}
                value={prefs.start}
                unit={t("sr_wpm_unit")}
                step={25}
                min={100}
                max={1500}
                onChange={(n) => patchPrefs({ start: n })}
              />
              <Stepper
                label={t("sr_target_speed")}
                value={prefs.target}
                unit={t("sr_wpm_unit")}
                step={25}
                min={150}
                max={2000}
                onChange={(n) => patchPrefs({ target: n })}
              />
              <div className="sr-set-row">
                <span>{t("ramp")}</span>
                <div className="sr-choice">
                  {(
                    [
                      ["smooth", t("sr_ramp_smooth")],
                      ["steps", t("sr_ramp_steps")],
                      ["off", t("sr_ramp_off")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`hud-btn ${prefs.mode === id ? "amber" : ""}`}
                      onClick={() => patchPrefs({ mode: id })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Stepper
                label={t("sr_ramp_step")}
                value={prefs.step}
                unit={t("sr_wpm_unit")}
                step={5}
                min={5}
                max={100}
                onChange={(n) => patchPrefs({ step: n })}
              />
              <Stepper
                label={t("sr_ramp_every")}
                value={prefs.everyS}
                unit={t("sr_sec_unit")}
                step={10}
                min={10}
                max={300}
                onChange={(n) => patchPrefs({ everyS: n })}
              />
              <div className="sr-set-row">
                <span>{t("sr_punct_pauses")}</span>
                <button
                  type="button"
                  className={`hud-btn ${prefs.punctPauses ? "ok" : ""}`}
                  onClick={() => patchPrefs({ punctPauses: !prefs.punctPauses })}
                >
                  {prefs.punctPauses ? t("on") : t("off")}
                </button>
              </div>
            </section>

            <section className="panel-inset sr-set-panel">
              <h3 className="route-title">{t("sr_show_check")}</h3>
              <Stepper
                label={t("sr_words_frame")}
                value={prefs.wordsPerFrame}
                unit=""
                step={1}
                min={1}
                max={5}
                onChange={(n) => patchPrefs({ wordsPerFrame: n })}
              />
              <Stepper
                label={t("sr_font_pt")}
                value={prefs.fontPt}
                unit="pt"
                step={2}
                min={22}
                max={72}
                onChange={(n) => patchPrefs({ fontPt: n })}
              />
              {(
                [
                  ["orp", t("hd_orp"), prefs.orp],
                  ["guides", t("hd_guides"), prefs.guides],
                  ["translate", t("hd_under_word"), prefs.translate],
                ] as const
              ).map(([key, label, on]) => (
                <div key={key} className="sr-set-row sr-set-tog">
                  <span>{label}</span>
                  <button
                    type="button"
                    className={`hud-btn ${on ? "ok" : ""}`}
                    onClick={() => patchPrefs({ [key]: !on })}
                  >
                    {on ? t("on") : t("off")}
                  </button>
                </div>
              ))}
            </section>

            <section className="panel-inset sr-set-panel">
              <h3 className="route-title">{t("sr_book_settings")}</h3>
              <Stepper
                label={t("sr_book_font")}
                value={prefs.bookFontPt}
                unit="pt"
                step={1}
                min={12}
                max={28}
                onChange={(n) => patchPrefs({ bookFontPt: n })}
              />
              <div className="sr-set-row">
                <span>{t("sr_book_view")}</span>
                <div className="sr-choice">
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
                      className={`hud-btn ${prefs.bookMode === id ? "amber" : ""}`}
                      onClick={() => patchPrefs({ bookMode: id })}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sr-set-row">
                <span>{t("sr_book_theme")}</span>
                <div className="sr-choice">
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
                      className={`hud-btn ${prefs.bookTheme === id ? "amber" : ""}`}
                      onClick={() => patchPrefs({ bookTheme: id })}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
