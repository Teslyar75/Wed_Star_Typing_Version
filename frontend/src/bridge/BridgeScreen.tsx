import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DONE, ERROR, TypingEngine } from "../typing/engine";
import { FINGER_COLORS, HOME_BUMPS, keyForChar, MOD_FINGER, ROWS } from "../typing/layouts";
import { t, onLangChange } from "../i18n";
import { useReadingPos } from "../reading/positionStore";
import { playClick, playError, playFinish } from "../fx/sounds";
import { useRadio } from "../radio/radioStore";
import Heatmap, { type KeyRate } from "./Heatmap";
import { sentenceAround, wordAt, wordCursor } from "./uplink";
import AccRing from "./AccRing";
import SpeedGauge from "./SpeedGauge";
import RhythmBar from "./RhythmBar";
import { useCabin } from "../settings/cabinStore";

type Segment = { idx: number; original: string; translation: string; status: string; char_start?: number };

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

export default function BridgeScreen() {
  const setSentence = useReadingPos((s) => s.setSentence);
  const [textId, setTextId] = useState<number | null>(null);
  const [draft, setDraft] = useState("the quick brown fox jumps over the lazy dog");
  const [lang, setLang] = useState("en");
  const [engine, setEngine] = useState(() => new TypingEngine(draft));
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState(() => t("ready"));
  const [segStarts, setSegStarts] = useState<number[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [keyRates, setKeyRates] = useState<KeyRate[]>([]);
  const [showHeat, setShowHeat] = useState(false);
  const [, bumpLang] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeDrillRef = useRef<string | null>(null);
  const duckOnType = useRadio((s) => s.duckOnType);
  const setDuck = useRadio((s) => s.setDuck);
  const duckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showKeyboard = useCabin((s) => s.keyboard);
  const showZones = useCabin((s) => s.zones);
  const showTranslator = useCabin((s) => s.translator);
  const now = () => performance.now() / 1000;

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

  useEffect(() => onLangChange(() => bumpLang((x) => x + 1)), []);

  useEffect(() => {
    void refreshHeatmap();
  }, [refreshHeatmap]);

  useEffect(() => {
    activeDrillRef.current = activeDrill;
  }, [activeDrill]);

  /* Старт с вкладок «Миссии» / «Свой текст» */
  useEffect(() => {
    const raw = sessionStorage.getItem("st_pending_drill");
    if (!raw) return;
    sessionStorage.removeItem("st_pending_drill");
    try {
      const j = JSON.parse(raw) as { id: string; text: string; lang?: string; index?: number };
      if (j.lang) setLang(j.lang);
      setActiveDrill(j.id === "cargo" ? null : j.id);
      setDraft(j.text);
      setSegStarts([]);
      setSegments([]);
      setTextId(null);
      const idx = j.index && j.index > 0 && j.index < j.text.length ? j.index : 0;
      setEngine(new TypingEngine(j.text, { index: idx, typed: idx }));
      setStatus(t("ready"));
      setTick((x) => x + 1);
    } catch {
      /* ignore */
    }
  }, [reloadEngine]);

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
    if (drillId && drillId !== "repair") {
      await fetch(`/api/missions/drills/${drillId}/complete`, {
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
    }
    void refreshHeatmap();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (engine.paused) engine.resume();
      else engine.pause(now());
      setStatus(engine.paused ? t("pause") : t("flying"));
      setTick((x) => x + 1);
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
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
    } else if (res === DONE) {
      playFinish();
      setStatus(t("finish"));
      setDuck(false);
    } else {
      playClick();
      setStatus(t("flying"));
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
    const cpm = Math.round(engine.cpm(t0));
    const elapsed = engine.elapsed(t0);
    const left = engine.progress > 0.02 && cpm > 0 ? Math.round(((1 - engine.progress) * engine.text.length) / (cpm / 60)) : null;
    return {
      cpm,
      inst: Math.round(engine.instantCpm()),
      wpm: Math.round(cpm / 5),
      acc: engine.accuracy != null ? (Math.round(engine.accuracy * 10) / 10) : null,
      err: engine.errors,
      el: elapsed,
      elLabel: `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`,
      leftLabel:
        left == null
          ? "—"
          : `≈${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`,
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
  const sightSentence = useMemo(() => {
    const si = sentenceAt(engine.index);
    const seg = segments[si];
    if (seg?.translation?.trim()) return seg.translation.trim();
    if (seg?.original?.trim()) return seg.original.trim();
    return sentenceAround(engine.text, engine.index);
  }, [engine.index, engine.text, segments, tick]);
  const sightIsTranslation = Boolean(segments[sentenceAt(engine.index)]?.translation?.trim());

  return (
    <section className="bridge bridge-cockpit">
      <header className="route-head">
        <div>
          <h2 className="route-title">
            {t("own_text")} · {t("cargo_run")}
          </h2>
          <p className="muted">{t("progress_autosave")}</p>
        </div>
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
        <div className={`viewport sight-line ${flash ? "flash" : ""}`} onClick={() => inputRef.current?.focus()}>
          {/* Прицел фиксирован по центру — буквы проходят сквозь него (Viewport.redraw) */}
          <div className="sight-left typed" aria-hidden>
            {slice.slice(0, cursorLocal)}
          </div>
          <span className="cursor sight-crosshair">{engine.current ?? (engine.finished ? "¶" : " ")}</span>
          <div className="sight-right ahead" aria-hidden>
            {slice.slice(cursorLocal + (engine.finished ? 0 : 1))}
          </div>
          <input
            ref={inputRef}
            className="ghost-input"
            onKeyDown={onKey}
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
              <div className="sight-tick bot" aria-hidden />
            </div>
            <p className={`sight-sentence ${sightIsTranslation ? "" : "muted"}`}>{sightSentence || "—"}</p>
          </div>
        )}
      </div>

      <div className="instruments">
        <aside className="inst-panel inst-engine">
          <h3>{t("engine")}</h3>
          <SpeedGauge value={stats.inst || stats.cpm} avg={stats.cpm} wpm={stats.wpm} title={t("speed_label")} unit={t("cpm_unit")} />
          <RhythmBar value={stats.rhythm} />
        </aside>

        <aside className="inst-panel inst-keys">
          <h3>{t("finger_nav")}</h3>
          {showKeyboard && (
            <div className="keyboard" aria-hidden>
              {ROWS.map((row, ri) => (
                <div className="kb-row" key={ri}>
                  {row.map(([id, en, ru, w, finger]) => {
                    const active = id === highlight;
                    const zone = showZones ? (FINGER_COLORS[finger] ?? FINGER_COLORS[9]!) : "var(--st-line)";
                    const isMod = finger === MOD_FINGER;
                    return (
                      <div
                        key={id}
                        className={`key ${active ? "active" : ""} ${isMod ? "mod" : ""}`}
                        style={{
                          flex: `${w} 1 0`,
                          minWidth: 0,
                          borderColor: active ? "var(--st-accent)" : isMod ? "var(--st-line)" : zone,
                          background: active
                            ? `color-mix(in srgb, var(--st-accent) 55%, #000)`
                            : isMod
                              ? "color-mix(in srgb, var(--st-panel) 80%, #000)"
                              : showZones
                                ? `color-mix(in srgb, ${zone} 13%, var(--st-panel))`
                                : "var(--st-panel)",
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
                if (engine.paused) {
                  engine.resume();
                  setStatus(t("flying"));
                } else {
                  engine.pause(now());
                  setStatus(t("pause"));
                }
                setTick((x) => x + 1);
                inputRef.current?.focus();
              }}
            >
              {engine.paused ? `▶ ${t("pause")}` : t("pause")} Esc
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
