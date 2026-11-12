/**
 * АНГЛИЙСКИЙ — 10 подвкладок + хаб-связи (см. docs/web/ENGLISH_LINK_MAP.md).
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { useRadio } from "../radio/radioStore";
import { useReadingPos } from "../reading/positionStore";
import { EN_PAGES } from "../shell/routes";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import { isAbortError } from "../shell/requestEpoch";
import EnglishOverview from "./EnglishOverview";
import FromBookPage from "./FromBookPage";
import ListsPage from "./ListsPage";
import LogPage from "./LogPage";
import MissionsPage from "./MissionsPage";
import ReviewPage from "./ReviewPage";
import ScannerPage from "./ScannerPage";
import SettingsPage from "./SettingsPage";
import SetsHubPage from "./SetsHubPage";
import WarehousePage from "./WarehousePage";
import type { EnPage, EnProgress, EnSettings } from "./types";

const EN_LABEL: Record<EnPage, string> = {
  overview: "en_overview",
  sets: "en_star_maps",
  scanner: "en_scanner",
  practice: "en_missions",
  review: "en_systems_check",
  warehouse: "en_warehouse",
  book: "en_from_book_tab",
  lists: "en_lists",
  log: "en_log",
  settings: "en_settings",
};

const PAGES: { id: EnPage; labelKey: string }[] = EN_PAGES.map((id) => ({
  id,
  labelKey: EN_LABEL[id],
}));

/** Корневые селекторы активной EN-поверхности — скрытая подстраница не должна оставаться в DOM. */
export const EN_SURFACE: Record<EnPage, string> = {
  overview: ".en-overview-grid",
  sets: ".en-starmaps",
  scanner: ".en-scanner",
  practice: ".en-missions, .en-mission-flight, .en-mission-debrief",
  review: ".en-review",
  warehouse: ".en-warehouse",
  book: ".en-from-book",
  lists: ".en-lists",
  log: ".en-log",
  settings: ".en-settings",
};

export type MissionLaunch = {
  mode?: "random" | "speaking" | "reading" | "questions";
  source?: string;
  setId?: string;
  listId?: number;
  single?: string;
  ids?: number[];
  autoStart?: boolean;
};

/** Как на десктопе: UI сразу, словарь досеивается в фоне мелкими порциями. */
const STUB_PROG: EnProgress = {
  xp: 0,
  rank: "—",
  favorite: 0,
  learned: 0,
  inbox: 0,
  due: 0,
  streak_days: 0,
  best_streak: 0,
  daily_goal: 30,
  xp_today: 0,
  new_available: 20,
  level: 1,
  level_lo: 0,
  level_hi: 100,
  vocab_total: 0,
};

const LAST_SCAN_KEY = "st_en_last_scan";

function readLastScan(): string {
  try {
    return (localStorage.getItem(LAST_SCAN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeLastScan(word: string) {
  const w = word.trim();
  if (!w) return;
  try {
    localStorage.setItem(LAST_SCAN_KEY, w);
  } catch {
    /* private mode */
  }
}

export default function EnglishPanel() {
  const textId = useReadingPos((s) => s.textId);
  const sentenceId = useReadingPos((s) => s.sentenceId);
  const [page, setPage] = useState<EnPage>("overview");
  const [scanQ, setScanQ] = useState(() => readLastScan());
  /** последнее слово в зоне сканера — вкладка «Сканер» всегда открывает его */
  const [scanSeed, setScanSeed] = useState(() => readLastScan());
  const [scanBack, setScanBack] = useState<EnPage>("sets");
  const [missionLaunch, setMissionLaunch] = useState<MissionLaunch>({});
  const [missionKey, setMissionKey] = useState(0);
  const [prog, setProg] = useState<EnProgress>(STUB_PROG);
  const [seedHint, setSeedHint] = useState("");
  const [whCount, setWhCount] = useState(0);
  const [bookReady, setBookReady] = useState(0);
  const [bookTitle, setBookTitle] = useState("");
  const [bookSegments, setBookSegments] = useState(0);
  const [settings, setSettings] = useState<EnSettings | null>(null);
  const [missionSet, setMissionSet] = useState("top-3000");
  const [hubTab, setHubTab] = useState<"std" | "cefr" | "verbs" | "book">("std");
  const setDuck = useRadio((s) => s.setDuck);
  const duckOnType = useRadio((s) => s.duckOnType);
  const seedBusy = useRef(false);

  const onDuck = (on: boolean) => {
    if (duckOnType) setDuck(on);
  };

  // Прогрев Vosk заранее — иначе речь теряется на загрузке модели
  useEffect(() => {
    void import("./asr").then((m) => m.preloadVosk());
  }, []);

  // Фон: досев словаря мелкими пачками (не блокируем вкладку).
  useEffect(() => {
    let cancelled = false;
    let waitTimer: number | undefined;
    const ac = new AbortController();
    const pump = async () => {
      if (seedBusy.current) return;
      seedBusy.current = true;
      try {
        // быстрый старт: одна маленькая порция, чтобы lookup/обзор жили
        const first = await fetch("/api/english/seed?limit=3000&batch=250", {
          method: "POST",
          credentials: "include",
          signal: ac.signal,
        });
        if (cancelled) return;
        if (first.ok) {
          const j = (await first.json()) as { done?: boolean; total?: number };
          if (cancelled) return;
          if (!j.done) {
            setSeedHint(t("en_seed_bg").replace("{0}", String(j.total ?? 0)));
          } else {
            setSeedHint("");
          }
        }
        // дальше — редко и по чуть-чуть, пока вкладка открыта
        while (!cancelled) {
          await new Promise<void>((res) => {
            waitTimer = window.setTimeout(res, 2500);
          });
          if (cancelled) break;
          const r = await fetch("/api/english/seed?limit=20580&batch=200", {
            method: "POST",
            credentials: "include",
            signal: ac.signal,
          });
          if (!r.ok || cancelled) break;
          const j = (await r.json()) as { done?: boolean; total?: number };
          if (cancelled) break;
          if (j.done) {
            setSeedHint("");
            break;
          }
          setSeedHint(t("en_seed_bg").replace("{0}", String(j.total ?? 0)));
        }
      } catch (e) {
        if (isAbortError(e)) return;
      } finally {
        seedBusy.current = false;
      }
    };
    void pump();
    return () => {
      cancelled = true;
      ac.abort();
      if (waitTimer != null) window.clearTimeout(waitTimer);
    };
  }, []);

  const reloadMeta = async (signal?: AbortSignal) => {
    const alive = () => !signal?.aborted;
    // прогресс — первым и отдельно: UI не ждёт склад/книги
    try {
      const p = await fetch("/api/english/progress", { credentials: "include", signal });
      if (alive() && p.ok) setProg(await p.json());
    } catch (e) {
      if (isAbortError(e) || !alive()) return;
      /* stub уже на экране */
    }
    if (!alive()) return;
    try {
      const s = await fetch("/api/english/settings", { credentials: "include", signal });
      if (alive() && s.ok) {
        const j = (await s.json()) as EnSettings;
        setSettings(j);
        if (j.current_set) setMissionSet(j.current_set);
      }
    } catch (e) {
      if (isAbortError(e) || !alive()) return;
    }
    if (!alive()) return;
    try {
      const wh = await fetch("/api/english/warehouse/cards?state=shelf", { credentials: "include", signal });
      if (alive() && wh.ok) {
        const rows = (await wh.json()) as unknown[];
        setWhCount(Array.isArray(rows) ? rows.length : 0);
      }
    } catch (e) {
      if (isAbortError(e) || !alive()) return;
    }
    if (!alive()) return;
    try {
      const bk = await fetch("/api/english/book/hub", { credentials: "include", signal });
      if (alive() && bk.ok) {
        const rows = (await bk.json()) as { cards?: number; ready?: number; due?: number }[];
        if (Array.isArray(rows) && alive()) {
          setBookReady(rows.reduce((n, r) => n + (r.due || r.ready || r.cards || 0), 0));
        }
      }
    } catch (e) {
      if (isAbortError(e) || !alive()) return;
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    void reloadMeta(ac.signal);
    return () => ac.abort();
  }, [page]);

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

  useEffect(() => {
    const meta = PAGES.find((p) => p.id === page);
    setDeepRoute([{ slug: page, label: meta ? t(meta.labelKey) : page }]);
    setZoneScreens("english", PAGES.map((p) => ({ slug: p.id, label: t(p.labelKey) })));
  }, [page]);

  const rememberScan = (word: string) => {
    const w = word.trim();
    if (!w) return;
    setScanQ(w);
    setScanSeed(w);
    writeLastScan(w);
  };

  const openScanner = (word: string, back?: EnPage) => {
    const w = word.trim();
    setScanBack(back ?? (page === "scanner" ? scanBack : page));
    if (w) rememberScan(w);
    setPage("scanner");
    void reloadMeta();
  };

  /** вкладка «Сканер» = тот же экран, что из карты: последнее слово (или пустой seed → WOD внутри) */
  const go = (name: EnPage) => {
    if (name === "scanner") {
      const last = scanSeed.trim() || scanQ.trim() || readLastScan();
      openScanner(last, page === "scanner" ? scanBack : page);
      return;
    }
    if (name === "sets") setHubTab("std");
    setPage(name);
    void reloadMeta();
  };

  useEffect(() => {
    registerGoHandler((slugs) => {
      const id = slugs[0] as EnPage | undefined;
      if (id && PAGES.some((p) => p.id === id)) go(id);
    });
    return () => registerGoHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- регистрация на mount/смену go
  }, [page, scanSeed, scanQ, scanBack]);

  const openSets = (setId: string) => {
    // Плитки обзора CEFR / Глаголы / Из книги открывают свою вкладку хаба, а не частотную карту.
    if (setId === "cefr" || setId === "verbs" || setId === "book") {
      setHubTab(setId);
    } else {
      setHubTab("std");
      setMissionSet(setId);
    }
    setPage("sets");
  };

  const startMission = (opts: MissionLaunch) => {
    if (opts.setId) setMissionSet(opts.setId);
    setMissionLaunch({
      mode: opts.mode || "random",
      source: opts.source || "set",
      setId: opts.setId || missionSet,
      listId: opts.listId,
      single: opts.single,
      ids: opts.ids,
      autoStart: opts.autoStart !== false,
    });
    setMissionKey((k) => k + 1);
    setPage("practice");
  };

  const startReview = () => {
    setPage("review");
  };

  const runScan = () => {
    const q = scanQ.trim() || scanSeed.trim() || readLastScan();
    openScanner(q, page === "scanner" ? scanBack : page);
  };

  const navLabel = (id: EnPage, base: string) => {
    if (id === "review" && prog && prog.due > 0) return `${base} (${prog.due})`;
    if (id === "warehouse" && whCount > 0) return `${base} (${whCount})`;
    if (id === "book" && bookReady > 0) return `${base} (${bookReady})`;
    return base;
  };

  return (
    <div className="english" data-en-page={page} data-testid="en-panel">
      <div className="en-nav-row">
        <div className="bridge-actions en-nav">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              data-en-nav={p.id}
              className={`hud-btn ${page === p.id ? "amber" : ""}`}
              onClick={() => go(p.id)}
            >
              {navLabel(p.id, t(p.labelKey))}
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

      {seedHint ? <p className="muted en-seed-hint">{seedHint}</p> : null}

      {page === "overview" && (
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
          onStartLesson={startReview}
          onQuickMission={() => startMission({ mode: "random", source: "set", setId: missionSet })}
          onFromBook={() => go("book")}
          onFormBook={() => go("book")}
          onPracticeBook={() => startMission({ mode: "speaking", source: "book", autoStart: true })}
          onOpenBookSection={() => go("book")}
          onOpenSet={openSets}
          onScanWord={(w) => openScanner(w, "overview")}
        />
      )}

      {page === "sets" && (
        <SetsHubPage
          key={hubTab}
          initialTab={hubTab}
          currentSet={missionSet}
          onOpenScanner={(w) => openScanner(w, "sets")}
          onStartMission={(id) => startMission({ mode: "random", source: "set", setId: id })}
          onLearnCards={(id) => {
            setMissionSet(id);
            startReview();
          }}
          onSetChange={setMissionSet}
          onDuck={onDuck}
          ttsRate={settings?.tts_rate ?? 1}
          onPracticeBook={() => startMission({ mode: "speaking", source: "book", autoStart: true })}
        />
      )}

      {page === "scanner" && (
        <ScannerPage
          initialQuery={scanSeed}
          onDuck={onDuck}
          ttsRate={settings?.tts_rate ?? 1}
          backPage={scanBack}
          currentSet={missionSet}
          onBack={() => go(scanBack || "sets")}
          onNeighborWord={(w) => rememberScan(w)}
          onStartMission={(mode, word) =>
            startMission({ mode, source: "set", setId: missionSet, single: word, autoStart: true })
          }
        />
      )}

      {page === "practice" && (
        <MissionsPage
          key={missionKey}
          onDuck={onDuck}
          ttsRate={settings?.tts_rate ?? 1}
          defaultLen={settings?.mission_len ?? 10}
          defaultSet={missionLaunch.setId || missionSet}
          defaultMode={missionLaunch.mode}
          defaultSource={missionLaunch.source}
          listId={missionLaunch.listId}
          single={missionLaunch.single}
          autoStart={missionLaunch.autoStart}
          asr={settings?.asr !== false}
          onOpenWord={(w) => openScanner(w, "practice")}
          onExitHub={() => {
            setMissionLaunch({});
          }}
        />
      )}

      {page === "review" && (
        <ReviewPage onDuck={onDuck} ttsRate={settings?.tts_rate ?? 1} reverse={settings?.reverse_cards} />
      )}

      {page === "warehouse" && (
        <WarehousePage
          onDuck={onDuck}
          ttsRate={settings?.tts_rate ?? 1}
          defaultGoal={settings?.warehouse_passes ?? 2}
          onOpenScanner={() => go("scanner")}
        />
      )}

      {page === "book" && (
        <FromBookPage onPractice={() => startMission({ mode: "speaking", source: "book", autoStart: true })} />
      )}

      {page === "lists" && (
        <ListsPage
          onOpenScanner={(w) => openScanner(w, "lists")}
          onMissionFromList={(listId) => startMission({ mode: "random", source: "list", listId, autoStart: true })}
          onReviewFromList={() => startReview()}
        />
      )}

      {page === "log" && (
        <LogPage
          onReviewMistakes={startReview}
          onMissionMistakes={() => startMission({ mode: "random", source: "mistakes", autoStart: true })}
          onOpenWord={(w) => openScanner(w, "log")}
        />
      )}

      {page === "settings" && <SettingsPage onChange={setSettings} />}
    </div>
  );
}
