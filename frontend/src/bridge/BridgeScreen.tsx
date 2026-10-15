import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DONE, ERROR, TypingEngine } from "../typing/engine";
import { FINGER_COLORS, HOME_BUMPS, keyForChar, MOD_FINGER, ROWS } from "../typing/layouts";
import { t, onLangChange } from "../i18n";
import {
  loadCargoBoard,
  loadTypingSession,
  saveCargoBoard,
  type CargoBoard,
} from "../cargo/processText";
import { useReadingPos } from "../reading/positionStore";
import { playClick, playError, playFinish } from "../fx/sounds";
import { useRadio } from "../radio/radioStore";
import { getTrStore } from "../speedread/trCache";
import Heatmap, { type KeyRate } from "./Heatmap";
import { wordAt, wordCursor } from "./uplink";
import { buildUplinkSegments, uplinkSourceAt, type UplinkSeg } from "./uplinkSegments";
import AccRing from "./AccRing";
import SpeedGauge from "./SpeedGauge";
import RhythmBar from "./RhythmBar";
import MissionMiniPlaque, { type MissionBrief } from "./MissionMiniPlaque";
import DebriefModal, { type DebriefData } from "./DebriefModal";
import { useCabin } from "../settings/cabinStore";
import { setModalStack } from "../shell/routeStore";

function WordSight({ word, cursor }: { word: string; cursor: number }) {
  if (!word) return <span className="sight-word-empty">—</span>;
  return (
    <span className="sight-word" aria-label={word}>
      {word.split("").map((ch, i) => {
        let cls = "sight-ch";
        if (cursor >= 0 && i === cursor) cls += " on";
        else if (cursor >= 0 && i < cursor) cls += " done";
        return (
          <span key={`${i}-${ch}`} className={cls}>
            {ch}
          </span>
        );
      })}
      <span className="sight-ellipsis"> …</span>
    </span>
  );
}

/** Окно вокруг курсора — DOM не держит весь текст (критерий 100k). */
const WINDOW = 140;
const DEFAULT_DRAFT = "the quick brown fox jumps over the lazy dog";

/** Порт cockpit._bootstrap → resume_cargo: сразу поднять незаконченный груз. */
function bootCargo(): CargoBoard | null {
  try {
    return loadTypingSession();
  } catch {
    return null;
  }
}

export default function BridgeScreen() {
  const setSentence = useReadingPos((s) => s.setSentence);
  const [boot] = useState(bootCargo);
  const [textId, setTextId] = useState<number | null>(() => boot?.textId ?? null);
  const [draft, setDraft] = useState(() => boot?.text || DEFAULT_DRAFT);
  const [cargoOriginal, setCargoOriginal] = useState(() => (boot?.original || "").trim());
  const [lang, setLang] = useState("en");
  const [engine, setEngine] = useState(() => {
    if (boot?.text) {
      const idx = Math.max(0, Math.min(boot.index || 0, boot.text.length - 1));
      return new TypingEngine(boot.text, {
        index: idx,
        typed: boot.typed ?? idx,
        errors: boot.errors ?? 0,
        elapsed: boot.elapsed ?? 0,
      });
    }
    return new TypingEngine(DEFAULT_DRAFT);
  });
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const [keyErr, setKeyErr] = useState(false);
  const [pauseSub, setPauseSub] = useState("");
  const [status, setStatus] = useState(() => t("ready"));
  const [segStarts, setSegStarts] = useState<number[]>([]);
  const [uplinkSegs, setUplinkSegs] = useState<UplinkSeg[]>(() =>
    boot?.text ? buildUplinkSegments(boot.text, boot.original || null) : [],
  );
  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [activeMission, setActiveMission] = useState<MissionBrief | null>(null);
  const [keyRates, setKeyRates] = useState<KeyRate[]>([]);
  const [showHeat, setShowHeat] = useState(false);
  const [debrief, setDebrief] = useState<DebriefData | null>(null);
  const [, bumpLang] = useState(0);

  useEffect(() => {
    if (debrief) setModalStack([{ slug: "debrief", label: t("debrief_title") }]);
    else setModalStack([]);
  }, [debrief]);

  useEffect(() => {
    if (!debrief) return;
    const onGo = (e: Event) => {
      const slugs = ((e as CustomEvent<{ slugs: string[] }>).detail?.slugs || []) as string[];
      if (!slugs.includes("debrief")) setDebrief(null);
    };
    window.addEventListener("st-crumb-go", onGo);
    return () => window.removeEventListener("st-crumb-go", onGo);
  }, [debrief]);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeDrillRef = useRef<string | null>(null);
  const activeMissionRef = useRef<MissionBrief | null>(null);
  const draftRef = useRef(draft);
  const engineRef = useRef(engine);
  const cargoOriginalRef = useRef(cargoOriginal);
  const textIdRef = useRef(textId);
  engineRef.current = engine;
  cargoOriginalRef.current = cargoOriginal;
  textIdRef.current = textId;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duckOnType = useRadio((s) => s.duckOnType);
  const setDuck = useRadio((s) => s.setDuck);
  const duckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showKeyboard = useCabin((s) => s.keyboard);
  const showZones = useCabin((s) => s.zones);
  const showTranslator = useCabin((s) => s.translator);
  const sightOn = useCabin((s) => s.sight);
  const now = () => performance.now() / 1000;

  /** Прицел + целевая клавиша: при промахе вспышка красным; в покое цель — оранжевый. */
  const showErrorFlash = useCallback(() => {
    setFlash(true);
    setKeyErr(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (keyErrTimer.current) clearTimeout(keyErrTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 280);
    keyErrTimer.current = setTimeout(() => setKeyErr(false), 380);
  }, []);

  const enterPause = useCallback(
    (sub = "") => {
      if (engine.finished || engine.paused) return;
      engine.pause(now());
      setPauseSub(sub);
      setStatus(t("pause"));
      setTick((x) => x + 1);
    },
    [engine],
  );

  const leavePause = useCallback(() => {
    if (!engine.paused) return;
    engine.resume();
    setPauseSub("");
    setStatus(t("flying"));
    setTick((x) => x + 1);
  }, [engine]);

  const reloadEngine = useCallback((text: string) => {
    setEngine(new TypingEngine(text));
    setStatus(t("ready"));
    setTick((x) => x + 1);
  }, []);

  const refreshHeatmap = useCallback(async () => {
    const r = await fetch("/api/missions/key-errors", { credentials: "include" });
    if (!r.ok) {
      setKeyRates([]);
      return;
    }
    setKeyRates(await r.json());
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [engine]);

  /* Живые приборы: время и стрелка скорости обновляются между нажатиями */
  useEffect(() => {
    if (engine.paused || engine.finished) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 120);
    return () => clearInterval(id);
  }, [engine, engine.paused, engine.finished]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (keyErrTimer.current) clearTimeout(keyErrTimer.current);
      if (duckTimer.current) clearTimeout(duckTimer.current);
    };
  }, []);

  useEffect(() => onLangChange(() => bumpLang((x) => x + 1)), []);

  useEffect(() => {
    void refreshHeatmap();
  }, [refreshHeatmap]);

  useEffect(() => {
    activeDrillRef.current = activeDrill;
  }, [activeDrill]);

  useEffect(() => {
    activeMissionRef.current = activeMission;
  }, [activeMission]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /* Старт с вкладок «Миссии» / «Свой текст» / библиотека → ⌨ ПЕЧАТАТЬ */
  useEffect(() => {
    const raw = sessionStorage.getItem("st_pending_drill");
    if (!raw) return;
    sessionStorage.removeItem("st_pending_drill");
    try {
      const j = JSON.parse(raw) as MissionBrief & {
        id: string;
        text: string;
        lang?: string;
        index?: number;
        original?: string;
        text_id?: number;
        title?: string;
      };
      if (j.lang) setLang(j.lang);
      const isCargo = j.id === "cargo";
      setActiveDrill(isCargo ? null : j.id);
      if (isCargo) {
        setActiveMission(null);
      } else {
        setActiveMission({
          id: j.id,
          lang: j.lang || "en",
          num: j.num ?? 0,
          title: j.title || j.id,
          sector: j.sector || "",
          new: j.new || "",
          goal: j.goal ?? 0,
          best_stars: j.best_stars ?? 0,
        });
      }
      setDraft(j.text);
      setSegStarts([]);
      const orig = (j.original || j.text || "").trim();
      setCargoOriginal(isCargo ? orig : "");
      setUplinkSegs(isCargo ? buildUplinkSegments(j.text, orig || null) : []);
      setTextId(isCargo && j.text_id != null ? j.text_id : null);
      const idx = j.index && j.index > 0 && j.index < j.text.length ? j.index : 0;
      if (isCargo) {
        saveCargoBoard({
          text: j.text,
          original: orig || j.text,
          index: idx,
          textId: j.text_id ?? null,
          title: j.title,
        });
      }
      setEngine(new TypingEngine(j.text, { index: idx, typed: idx }));
      setStatus(t("ready"));
      setTick((x) => x + 1);
    } catch {
      /* ignore */
    }
  }, [reloadEngine]);

  /* Сегменты UPLINK при смене текста (груз с полки / свой текст) */
  useEffect(() => {
    if (activeDrill) {
      setUplinkSegs([]);
      return;
    }
    const board = loadCargoBoard();
    const orig = cargoOriginal || board?.original || "";
    if (engine.text) setUplinkSegs(buildUplinkSegments(engine.text, orig || null));
  }, [activeDrill, engine.text, cargoOriginal]);

  const sentenceAt = (charIndex: number) => {
    if (!segStarts.length) return 0;
    let lo = 0;
    let hi = segStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (segStarts[mid]! <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const weakFromStats = (eng: TypingEngine): { ch: string; n: number }[] =>
    Object.entries(eng.keyStats)
      .filter(([ch, s]) => s[1] > 0 && ch !== " ")
      .map(([ch, s]) => ({ ch, n: s[1] }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);

  const saveSession = async (eng: TypingEngine) => {
    const seg = eng.segment(now());
    const key_stats: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(eng.keyStats)) key_stats[k] = [v[0], v[1]];
    await fetch("/api/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text_id: textId,
        ...seg,
        mode: activeDrillRef.current ? "drill" : "cargo",
        lang,
        key_stats,
      }),
    });

    const drillId = activeDrillRef.current;
    const mission = activeMissionRef.current;
    const weak = weakFromStats(eng);
    let stars = 0;
    let xp = 0;
    let passed = true;
    let nextId: string | null = null;
    let nextTitle: string | null = null;
    let goal = mission?.goal ?? 0;

    if (drillId && drillId !== "repair") {
      const free = localStorage.getItem("st_missions_unlock_all") === "1" ? "?unlock_all=1" : "";
      const r = await fetch(`/api/missions/drills/${drillId}/complete${free}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acc: seg.acc,
          cpm: seg.cpm,
          chars: seg.chars,
          errors: seg.errors,
          key_stats,
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as {
          stars: number;
          xp_gained: number;
          passed: boolean;
          goal?: number;
          next_id?: string | null;
          next_title?: string | null;
        };
        stars = j.stars;
        xp = j.xp_gained;
        passed = j.passed;
        goal = j.goal ?? goal;
        nextId = j.next_id ?? null;
        nextTitle = j.next_title ?? null;
      }
    }

    setDebrief({
      kind: drillId && drillId !== "repair" ? "mission" : "cargo",
      title: mission?.title,
      goal,
      stars,
      xp,
      passed,
      seg: {
        cpm: seg.cpm,
        acc: seg.acc,
        errors: seg.errors,
        elapsed: seg.elapsed,
        rhythm: seg.rhythm,
        best_streak: seg.best_streak,
      },
      weak,
      nextId,
      nextTitle,
    });
    void refreshHeatmap();
  };

  const startDrillById = async (missionId: string) => {
    const free = localStorage.getItem("st_missions_unlock_all") === "1" ? "?unlock_all=1" : "";
    const r = await fetch(`/api/missions/drills/${missionId}/start${free}`, {
      method: "POST",
      credentials: "include",
    });
    if (!r.ok) return;
    const j = (await r.json()) as {
      mission_id: string;
      title: string;
      text: string;
      goal: number;
      keys: string;
    };
    const prev = activeMissionRef.current;
    setActiveDrill(j.mission_id);
    setActiveMission({
      id: j.mission_id,
      lang: prev?.lang || lang,
      num: prev?.num ?? 0,
      title: j.title,
      sector: prev?.sector || "",
      new: j.keys || prev?.new || "",
      goal: j.goal,
      best_stars: prev?.best_stars ?? 0,
    });
    setDraft(j.text);
    setTextId(null);
    setSegStarts([]);
    setDebrief(null);
    reloadEngine(j.text);
  };

  const onDebriefRepeat = () => {
    const id = activeDrillRef.current;
    if (id && id !== "repair") {
      void startDrillById(id);
      return;
    }
    setDebrief(null);
    reloadEngine(draftRef.current);
  };

  const onDebriefNext = () => {
    const id = debrief?.nextId;
    if (id) void startDrillById(id);
  };

  const onDebriefRepair = async () => {
    const weak = debrief?.weak.map((w) => w.ch) || [];
    const r = await fetch("/api/missions/repair/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, weak }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { text: string };
    setActiveDrill("repair");
    setActiveMission({
      id: "repair",
      lang,
      num: 0,
      title: t("repair_systems"),
      sector: t("repair"),
      new: weak.join(""),
      goal: 0,
      best_stars: 0,
    });
    setDraft(j.text);
    setDebrief(null);
    reloadEngine(j.text);
  };

  const onDebriefClose = () => {
    setDebrief(null);
    setStatus(t("flight_done"));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (engine.paused) leavePause();
      else enterPause();
      return;
    }
    /* Backspace — возврат в предыдущее окно (App); не глотаем здесь */
    if (e.key === "Backspace") return;
    if (engine.paused) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        leavePause();
      }
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const ch = e.key.length === 1 ? e.key : e.key === " " ? " " : "";
    if (!ch) return;
    e.preventDefault();
    if (duckOnType) {
      setDuck(true);
      if (duckTimer.current) clearTimeout(duckTimer.current);
      duckTimer.current = setTimeout(() => setDuck(false), 900);
    }
    const res = engine.press(ch, now());
    if (res === null) return;
    if (res === ERROR) {
      playError();
      showErrorFlash();
    } else if (res === DONE) {
      playFinish();
      setStatus(t("finish"));
      setDuck(false);
      setFlash(false);
      setKeyErr(false);
    } else {
      playClick();
      setStatus(t("flying"));
      setFlash(false);
      setKeyErr(false);
    }
    setTick((x) => x + 1);
    setSentence(sentenceAt(engine.index));
    if (res === DONE) void saveSession(engine);
  };

  const idx = engine.index;
  const start = Math.max(0, idx - Math.floor(WINDOW / 3));
  const end = Math.min(engine.text.length, start + WINDOW);
  const slice = engine.text.slice(start, end);
  const cursorLocal = idx - start;
  const highlight = keyForChar(engine.current, lang);

  const stats = useMemo(() => {
    const t0 = now();
    const cpm = engine.cpm(t0);
    const inst = engine.instantCpm();
    /* live CPM как desktop: мгновенный, пока идёт набор; иначе средняя */
    const live = !engine.paused && inst > 0 ? inst : cpm;
    const elapsed = engine.elapsed(t0);
    const leftChars = Math.max(0, engine.text.length - engine.index);
    const leftSec =
      engine.progress > 0.02 && cpm > 10 && leftChars > 0
        ? Math.round((leftChars / (cpm / 60)))
        : null;
    return {
      cpm: Math.round(cpm),
      live: Math.round(live),
      wpm: Math.round(cpm / 5),
      acc: engine.accuracy != null ? Math.round(engine.accuracy * 10) / 10 : null,
      err: engine.errors,
      el: elapsed,
      elLabel: `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`,
      leftLabel:
        leftSec == null
          ? leftChars
            ? String(leftChars)
            : "—"
          : `≈${String(Math.floor(leftSec / 60)).padStart(2, "0")}:${String(leftSec % 60).padStart(2, "0")}`,
      pct: Math.round(engine.progress * 100),
      len: engine.text.length,
      done: engine.index,
      streak: engine.streak,
      bestStreak: engine.bestStreak,
      rhythm: engine.rhythm != null ? Math.round(engine.rhythm) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, engine]);

  const sightWord = useMemo(() => wordAt(engine.text, engine.index), [engine.text, engine.index, tick]);
  const sightCursor = useMemo(() => wordCursor(engine.text, engine.index), [engine.text, engine.index, tick]);
  const sightSource = useMemo(
    () => uplinkSourceAt(uplinkSegs, engine.index) || wordAt(engine.text, engine.index),
    [uplinkSegs, engine.index, engine.text, tick],
  );

  const [wordTr, setWordTr] = useState("…");
  const [sentTr, setSentTr] = useState("");
  const wordSrcRef = useRef("");
  const sentSrcRef = useRef("");
  const sentAbortRef = useRef<AbortController | null>(null);
  const uplinkOn = showTranslator && !activeDrill;
  const engineIndexRef = useRef(engine.index);
  const engineTextRef = useRef(engine.text);
  const uplinkSegsRef = useRef(uplinkSegs);
  engineIndexRef.current = engine.index;
  engineTextRef.current = engine.text;
  uplinkSegsRef.current = uplinkSegs;

  /* UPLINK: одно предложение/чанк (~14 слов), как desktop Segments — без abort на каждом tick. */
  useEffect(() => {
    if (!uplinkOn) {
      setWordTr("");
      setSentTr("");
      wordSrcRef.current = "";
      sentSrcRef.current = "";
      sentAbortRef.current?.abort();
      sentAbortRef.current = null;
      return;
    }
    const store = getTrStore();

    const fetchSentence = (src: string) => {
      const q = src.slice(0, 900);
      /* Как desktop Translator.cached — сначала диск/LS, без «…» при hit. */
      const hit = store.cached(q) || store.get(q);
      if (hit) {
        setSentTr(hit);
        return;
      }
      setSentTr("…");
      sentAbortRef.current?.abort();
      const ac = new AbortController();
      sentAbortRef.current = ac;
      void (async () => {
        try {
          const r = await fetch(
            `/api/reader/word-tr?q=${encodeURIComponent(q)}&src=en&dst=ru`,
            { credentials: "include", signal: ac.signal },
          );
          if (!r.ok) {
            if (!ac.signal.aborted && sentSrcRef.current === src) setSentTr("?");
            return;
          }
          const j = (await r.json()) as { tr?: string };
          const tr = (j.tr || "").trim();
          if (tr && !tr.startsWith("[ru]")) store.put(q, tr);
          if (!ac.signal.aborted && sentSrcRef.current === src) {
            setSentTr(tr && !tr.startsWith("[ru]") ? tr : "?");
          }
        } catch {
          if (!ac.signal.aborted && sentSrcRef.current === src) setSentTr("?");
        }
      })();
    };

    const apply = () => {
      const idx = engineIndexRef.current;
      const text = engineTextRef.current;
      const segs = uplinkSegsRef.current;
      const w = wordAt(text, idx);
      const sentSrc = uplinkSourceAt(segs, idx).trim();

      if (w !== wordSrcRef.current) {
        wordSrcRef.current = w;
        if (!w) {
          setWordTr("—");
        } else {
          const hit = store.cached(w);
          setWordTr(hit || "…");
          if (!hit) store.request(w, 0, "bridge-word");
        }
      } else if (w) {
        const hit = store.cached(w);
        if (hit) setWordTr(hit);
      }

      if (sentSrc !== sentSrcRef.current) {
        sentSrcRef.current = sentSrc;
        if (!sentSrc) setSentTr("");
        else fetchSentence(sentSrc);
      } else if (sentSrc) {
        const hit = store.cached(sentSrc.slice(0, 900));
        if (hit) setSentTr(hit);
      } else {
        setSentTr("");
      }
    };
    apply();
    const id = window.setInterval(apply, 280);
    return () => {
      clearInterval(id);
      /* не abort здесь — иначе каждый remount/смена deps рвёт перевод */
    };
  }, [uplinkOn, uplinkSegs]);

  /* Автосохранение сессии груза — порт bridge.persist (session.json + cargo). */
  useEffect(() => {
    if (activeDrill) return;
    if (!engine.text || engine.finished) return;
    const tmr = window.setTimeout(() => {
      const prev = loadCargoBoard();
      saveCargoBoard({
        text: engine.text,
        original: (cargoOriginal || prev?.original || engine.text).trim(),
        index: engine.index,
        typed: engine.typed,
        errors: engine.errors,
        textId: textId ?? prev?.textId ?? null,
        title: prev?.title,
      });
    }, 400);
    return () => clearTimeout(tmr);
  }, [activeDrill, engine.index, engine.typed, engine.errors, engine.text, engine.finished, cargoOriginal, textId]);

  /* Перед закрытием вкладки — force persist, как leave_current. */
  useEffect(() => {
    const flush = () => {
      if (activeDrillRef.current) return;
      const eng = engineRef.current;
      if (!eng.text || eng.finished) return;
      const prev = loadCargoBoard();
      saveCargoBoard({
        text: eng.text,
        original: (cargoOriginalRef.current || prev?.original || eng.text).trim(),
        index: eng.index,
        typed: eng.typed,
        errors: eng.errors,
        textId: textIdRef.current ?? prev?.textId ?? null,
        title: prev?.title,
      });
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  const sightSentence = uplinkOn ? sentTr || "…" : sightSource;
  const sightIsTranslation = uplinkOn
    ? Boolean(sentTr && sentTr !== "…" && sentTr !== "—" && sentTr !== sightSource)
    : false;

  return (
    <section className="bridge bridge-cockpit">
      {debrief ? (
        <DebriefModal
          data={debrief}
          onRepeat={onDebriefRepeat}
          onNext={debrief.nextId ? onDebriefNext : undefined}
          onRepair={debrief.weak.length || keyRates.length ? () => void onDebriefRepair() : undefined}
          onClose={onDebriefClose}
        />
      ) : null}
      <header className={`route-head ${activeMission ? "has-mission" : ""}`}>
        <div className="route-head-left">
          <h2 className="route-title">
            {activeMission
              ? `${t("missions")} · ${activeMission.title}`
              : `${t("own_text")} · ${t("cargo_run")}`}
          </h2>
          <p className="muted">{t("progress_autosave")}</p>
        </div>
        {activeMission ? <MissionMiniPlaque mission={activeMission} /> : <div className="route-head-spacer" />}
        <div className="route-progress" aria-label={t("route_progress")}>
          <span className="lab">{t("route_progress")}</span>
          <div className="route-bar">
            <div className="route-bar-fill" style={{ width: `${stats.pct}%` }} />
          </div>
          <span className="route-meta">
            {stats.done.toLocaleString()} / {stats.len.toLocaleString()} · {stats.pct}%
          </span>
        </div>
      </header>

      <div className="nav-channel">
        <div className="nav-channel-top">
          <span className="lab">{t("nav_channel")}</span>
          <span className={`flight-status ${engine.finished ? "done" : ""}`}>{status}</span>
        </div>
        <div
          className={`viewport sight-line ${flash ? "flash" : ""} ${engine.paused ? "is-paused" : ""}`}
          onClick={() => inputRef.current?.focus()}
        >
          {/* Прицел фиксирован по центру — буквы проходят сквозь него (Viewport.redraw) */}
          <div className="sight-left typed" aria-hidden>
            {slice.slice(0, cursorLocal)}
          </div>
          <span className={`cursor ${sightOn ? "sight-crosshair" : "sight-underline"}`}>
            {engine.current ?? (engine.finished ? "¶" : " ")}
          </span>
          <div className="sight-right ahead" aria-hidden>
            {slice.slice(cursorLocal + (engine.finished ? 0 : 1))}
          </div>
          {engine.paused ? (
            <div className="bridge-pause-overlay" aria-live="polite">
              <div className="bridge-pause-icon" aria-hidden>
                ❚❚
              </div>
              <div className="bridge-pause-title">{t("pause")}</div>
              <div className="bridge-pause-sub">{pauseSub || t("pause_hint")}</div>
            </div>
          ) : null}
          <input
            ref={inputRef}
            className="ghost-input"
            onKeyDown={onKey}
            onBlur={() => {
              if (!engine.finished && !engine.paused) enterPause(t("pause_focus"));
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="typing"
          />
        </div>

        {showTranslator && (
          <div className="uplink sight-uplink">
            <div className="uplink-title">UPLINK // {t("uplink")}</div>
            <div className="sight-box">
              <div className="sight-tick top" aria-hidden />
              <WordSight word={sightWord} cursor={sightCursor} />
              {uplinkOn ? (
                <>
                  <span className="sight-arrow" aria-hidden>
                    →
                  </span>
                  <span className="sight-word-tr" title={wordTr}>
                    {wordTr || "…"}
                  </span>
                </>
              ) : null}
              <div className="sight-tick bot" aria-hidden />
            </div>
            <p className={`sight-sentence ${sightIsTranslation ? "" : "muted"}`}>{sightSentence || "—"}</p>
          </div>
        )}
      </div>

      <div className="instruments">
        <aside className="inst-panel inst-engine">
          <h3>{t("engine")}</h3>
          <SpeedGauge value={stats.live} avg={stats.cpm} wpm={stats.wpm} title={t("speed_label")} unit={t("cpm_unit")} />
          <RhythmBar value={stats.rhythm} />
        </aside>

        <aside className="inst-panel inst-keys">
          <h3>{t("finger_nav")}</h3>
          {showKeyboard && (
            <div className={`keyboard lang-${lang.startsWith("ru") ? "ru" : "en"}`} aria-hidden>
              {ROWS.map((row, ri) => (
                <div className="kb-row" key={ri}>
                  {row.map(([id, en, ru, w, finger]) => {
                    const active = id === highlight;
                    const errKey = active && keyErr;
                    const zone = showZones ? (FINGER_COLORS[finger] ?? FINGER_COLORS[9]!) : "var(--st-line)";
                    const isMod = finger === MOD_FINGER;
                    return (
                      <div
                        key={id}
                        className={`key ${active ? "active" : ""} ${errKey ? "err" : ""} ${isMod ? "mod" : ""}`}
                        style={{
                          flex: `${w} 1 0`,
                          minWidth: 0,
                          /* active/err заливка — CSS --st-frame-fill (inline background глушит !important) */
                          ...(active
                            ? {}
                            : {
                                ["--st-frame-line" as string]: isMod ? "var(--st-line)" : zone,
                                ["--st-frame-fill" as string]: isMod
                                  ? "color-mix(in srgb, var(--st-panel) 14%, transparent)"
                                  : showZones
                                    ? `color-mix(in srgb, ${zone} 18%, transparent)`
                                    : "color-mix(in srgb, var(--st-panel) 14%, transparent)",
                              }),
                        }}
                      >
                        <span className="key-en">{en || "␣"}</span>
                        {ru && ru !== en ? <span className="key-ru">{ru}</span> : null}
                        {HOME_BUMPS.has(id) ? <span className="key-home" aria-hidden /> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="bridge-actions inst-actions">
            <button
              type="button"
              className={`hud-btn ${engine.paused ? "amber" : ""}`}
              onClick={() => {
                if (engine.paused) leavePause();
                else enterPause();
                inputRef.current?.focus();
              }}
            >
              {engine.paused ? t("pause_resume") : t("pause")} Esc
            </button>
            <button
              type="button"
              className="hud-btn amber"
              onClick={() => {
                reloadEngine(draft.includes("… (+") ? engine.text : draft);
                inputRef.current?.focus();
              }}
            >
              {t("again")} F5
            </button>
            <button type="button" className={`hud-btn ${showHeat ? "amber" : ""}`} onClick={() => setShowHeat((v) => !v)}>
              {t("heatmap")}
            </button>
          </div>
        </aside>

        <aside className="inst-panel inst-tele">
          <h3>{t("telemetry")}</h3>
          <AccRing
            value={stats.acc}
            title={t("accuracy_title")}
            sub={`${t("errors_of")} ${stats.err}`}
          />
          <ul className="tele-list">
            <li className="tele-time">
              <span className="lab">{t("time")}</span>
              <strong>{stats.elLabel}</strong>
            </li>
            <li className={stats.err ? "tele-err" : "tele-ok"}>
              <span className="lab">{t("errors")}</span>
              <strong>{stats.err}</strong>
            </li>
            <li className="tele-streak">
              <span className="lab">{t("streak")}</span>
              <strong>
                {stats.streak} / {stats.bestStreak}
              </strong>
            </li>
            <li className="tele-left">
              <span className="lab">{t("remaining")}</span>
              <strong>{stats.leftLabel}</strong>
            </li>
          </ul>
        </aside>
      </div>

      {showHeat && keyRates.length > 0 && <Heatmap rates={keyRates} lang={lang} />}
    </section>
  );
}
