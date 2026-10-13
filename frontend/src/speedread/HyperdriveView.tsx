/** Гипердрайв: полёт (слово+перевод) и пауза (оригинал · перевод · настройки) */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import {
  frameAt,
  frameMs,
  frameText,
  prevSentence,
  Ramp,
  tokenize,
  type RsvpWord,
} from "./rsvpCore";
import {
  ensureBootBuffer,
  getTrStore,
  requestWordTr,
  warmAheadTail,
} from "./trCache";

type RampMode = "smooth" | "steps" | "off";

type Props = {
  text: string;
  title?: string;
  textId?: number | null;
  startWpm?: number;
  targetWpm?: number;
  rampStep?: number;
  rampEveryS?: number;
  rampMode?: RampMode;
  punctPauses?: boolean;
  wordsPerFrame?: number;
  fontPtInit?: number;
  orpInit?: boolean;
  guidesInit?: boolean;
  translate?: boolean;
  onExit: () => void;
  onOpenBook?: () => void;
  onOpenLibrary?: () => void;
  onFinished?: (stats: { wpm: number; words: number; elapsed: number }) => void;
  onWpmPersist?: (wpm: number) => void;
};

function contextWindow(words: RsvpWord[], pos: number, before = 40, after = 60) {
  const lo = Math.max(0, pos - before);
  const hi = Math.min(words.length, pos + after);
  const parts: { text: string; cur: boolean }[] = [];
  for (let i = lo; i < hi; i++) {
    parts.push({ text: words[i]!.text, cur: i === pos });
  }
  return parts;
}

export default function HyperdriveView({
  text,
  title = "Hyperdrive",
  textId = null,
  startWpm = 300,
  targetWpm = 600,
  rampStep = 10,
  rampEveryS = 30,
  rampMode = "smooth",
  punctPauses = true,
  wordsPerFrame = 1,
  fontPtInit = 50,
  orpInit = true,
  guidesInit = true,
  translate: translateProp = true,
  onExit,
  onOpenBook,
  onOpenLibrary,
  onFinished,
  onWpmPersist,
}: Props) {
  const words = useMemo(() => tokenize(text), [text]);
  const [pos, setPos] = useState(0);
  const [running, setRunning] = useState(true);
  const [chunk, setChunk] = useState(Math.max(1, Math.min(5, wordsPerFrame)));
  const [fontPt, setFontPt] = useState(fontPtInit);
  const [orpOn, setOrpOn] = useState(orpInit);
  const [guidesOn, setGuidesOn] = useState(guidesInit);
  const [translateOn, setTranslateOn] = useState(translateProp);
  const [tr, setTr] = useState("");
  const [ctxTr, setCtxTr] = useState("");
  const [displayWpm, setDisplayWpm] = useState(startWpm);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [wordsRead, setWordsRead] = useState(0);
  const [frame, setFrame] = useState<{ text: string; orp: number; idxs: number[] }>({
    text: "",
    orp: 0,
    idxs: [],
  });

  const rampRef = useRef(new Ramp(startWpm, targetWpm, rampStep, rampEveryS, rampMode));
  const posRef = useRef(0);
  const runRef = useRef(true);
  const chunkRef = useRef(1);
  const wordsRef = useRef<RsvpWord[]>(words);
  const started = useRef(performance.now());
  const flyAccum = useRef(0);
  const lastTick = useRef(performance.now());
  const timer = useRef(0);
  /** Singleton как get_translator() — прогрев с полки не сбрасывается при монтировании. */
  const storeRef = useRef(getTrStore());
  const translateOnRef = useRef(translateOn);
  const frameTextRef = useRef("");
  const lastWarmAt = useRef(-999);
  const warmLeft = useRef(5); /* WARMUP_FRAMES из desktop reader.py */
  const punctRef = useRef(punctPauses);

  wordsRef.current = words;
  posRef.current = pos;
  runRef.current = running;
  chunkRef.current = chunk;
  translateOnRef.current = translateOn;
  punctRef.current = punctPauses;

  /** Порт _draw_word + _request_word_tr: sync из кэша + очередь текущего/prefetch. */
  const applyFrameTr = useCallback((w: RsvpWord[], idxs: number[]) => {
    if (!translateOnRef.current || !idxs.length) {
      setTr("");
      return;
    }
    const shown = requestWordTr(storeRef.current, w, idxs, chunkRef.current);
    setTr(shown);
    /* хвост вперёд (book_warm / span) — чтобы не было склейки после окна из 4 */
    const at = idxs[0] ?? 0;
    if (at - lastWarmAt.current >= 20 || at === 0) {
      lastWarmAt.current = at;
      warmAheadTail(storeRef.current, w, at, chunkRef.current);
    }
  }, []);

  const showFrame = useCallback(
    (at: number) => {
      const w = wordsRef.current;
      if (!w.length || at >= w.length) {
        setFrame({ text: "", orp: 0, idxs: [] });
        frameTextRef.current = "";
        setTr("");
        return;
      }
      const idxs = frameAt(w, at, chunkRef.current);
      const { text: ft, orp } = frameText(w, idxs);
      frameTextRef.current = ft;
      setFrame({ text: ft, orp, idxs });
      setPos(at);
      applyFrameTr(w, idxs);
    },
    [applyFrameTr],
  );

  useEffect(() => {
    storeRef.current = getTrStore();
    lastWarmAt.current = -999;
    warmLeft.current = 5;
    rampRef.current = new Ramp(startWpm, targetWpm, rampStep, rampEveryS, rampMode);
    setDisplayWpm(startWpm);
    setChunk(Math.max(1, Math.min(5, wordsPerFrame)));
    chunkRef.current = Math.max(1, Math.min(5, wordsPerFrame));
    setFontPt(fontPtInit);
    setOrpOn(orpInit);
    setGuidesOn(guidesInit);
    setTranslateOn(translateProp);
    started.current = performance.now();
    flyAccum.current = 0;
    lastTick.current = performance.now();
    setPos(0);
    setWordsRead(0);
    setElapsedSec(0);
    setTr("");
    /* буфер уже грели на полке / openHyperdrive; добиваем и стартуем */
    setRunning(false);
    showFrame(0);
    let cancelled = false;
    const boot = async () => {
      await ensureBootBuffer(storeRef.current, wordsRef.current, 0, chunkRef.current);
      if (cancelled) return;
      showFrame(0);
      setRunning(true);
    };
    void boot();
    return () => {
      cancelled = true;
      onWpmPersist?.(Math.round(rampRef.current.wpm));
    };
  }, [
    text,
    textId,
    startWpm,
    targetWpm,
    rampStep,
    rampEveryS,
    rampMode,
    wordsPerFrame,
    fontPtInit,
    orpInit,
    guidesInit,
    translateProp,
    showFrame,
    onWpmPersist,
  ]);

  useEffect(() => {
    if (!running) return;
    const step = () => {
      const w = wordsRef.current;
      const at = posRef.current;
      if (at >= w.length) {
        setRunning(false);
        const elapsed = flyAccum.current;
        onFinished?.({ wpm: Math.round(rampRef.current.wpm), words: w.length, elapsed });
        return;
      }
      const idxs = frameAt(w, at, chunkRef.current);
      const { text: ft, orp } = frameText(w, idxs);
      frameTextRef.current = ft;
      setFrame({ text: ft, orp, idxs });
      setPos(at);
      setDisplayWpm(Math.round(rampRef.current.wpm));
      setWordsRead(at);
      applyFrameTr(w, idxs);

      let ms = frameMs(w, idxs, rampRef.current.wpm, punctRef.current);
      if (warmLeft.current > 0) {
        ms *= 1.5;
        warmLeft.current -= 1;
      }
      timer.current = window.setTimeout(() => {
        const now = performance.now();
        const dt = (now - lastTick.current) / 1000;
        lastTick.current = now;
        flyAccum.current += dt;
        setElapsedSec(Math.floor(flyAccum.current));
        rampRef.current.tick(dt, idxs.length);
        const next = (idxs[idxs.length - 1] ?? at) + 1;
        posRef.current = next;
        if (runRef.current) step();
      }, ms);
    };
    lastTick.current = performance.now();
    step();
    return () => window.clearTimeout(timer.current);
  }, [running, onFinished, applyFrameTr]);

  /* _tr_poll_tick: 80 мс — подтянуть перевод текущего кадра, если сеть догнала */
  useEffect(() => {
    if (!translateOn) {
      setTr("");
      return;
    }
    showFrame(posRef.current);
    const tick = () => {
      storeRef.current.poll();
      const cur = frameTextRef.current;
      if (!cur) return;
      const hit = storeRef.current.get(cur);
      if (hit) setTr((prev) => (prev === hit ? prev : hit));
    };
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [translateOn, showFrame]);

  useEffect(() => {
    if (running || !translateOn) {
      setCtxTr("");
      return;
    }
    let cancelled = false;
    const parts = contextWindow(words, pos, 30, 40);
    const chunkText = parts.map((p) => p.text).join(" ").slice(0, 400);
    void (async () => {
      if (textId != null) {
        try {
          const r = await fetch(
            `/api/reader/${textId}/bilingual?offset=0&limit=12`,
            { credentials: "include" },
          );
          if (r.ok) {
            const segs = (await r.json()) as { translation?: string; original?: string }[];
            const hit = segs.find((s) => (s.original || "").includes(parts.find((p) => p.cur)?.text || "___never___"));
            const joined = segs
              .map((s) => s.translation || "")
              .filter((x) => x && x !== "…")
              .slice(0, 6)
              .join(" ");
            if (!cancelled && (hit?.translation || joined)) {
              setCtxTr(hit?.translation && hit.translation !== "…" ? hit.translation : joined);
              return;
            }
          }
        } catch {
          /* fall through */
        }
      }
      try {
        const r = await fetch(
          `/api/reader/word-tr?q=${encodeURIComponent(chunkText)}&src=en&dst=ru`,
          { credentials: "include" },
        );
        if (!r.ok) return;
        const j = (await r.json()) as { tr?: string };
        if (!cancelled) setCtxTr(j.tr && j.tr !== "?" ? j.tr : "");
      } catch {
        if (!cancelled) setCtxTr("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [running, translateOn, pos, words, textId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setRunning((v) => !v);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setRunning(false);
        onFinished?.({
          wpm: Math.round(rampRef.current.wpm),
          words: posRef.current,
          elapsed: flyAccum.current,
        });
        onExit();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        posRef.current = 0;
        showFrame(0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        rampRef.current.manual(25);
        setDisplayWpm(Math.round(rampRef.current.wpm));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        rampRef.current.manual(-25);
        setDisplayWpm(Math.round(rampRef.current.wpm));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const back = prevSentence(wordsRef.current, posRef.current);
        posRef.current = back;
        showFrame(back);
      }
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const n = Number(e.key);
        setChunk(n);
        chunkRef.current = n;
        showFrame(posRef.current);
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setFontPt((p) => Math.min(72, p + 4));
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setFontPt((p) => Math.max(22, p - 4));
      }
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTranslateOn((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, onFinished, showFrame]);

  const left = frame.text.slice(0, frame.orp);
  const mid = frame.text[frame.orp] ?? "";
  const right = frame.text.slice(frame.orp + 1);
  const n = words.length;
  const pct = n ? (pos / n) * 100 : 0;
  const ctx = contextWindow(words, pos);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const avgWpm = elapsedSec > 0 ? Math.round((wordsRead / elapsedSec) * 60) : displayWpm;

  if (!running) {
    return (
      <section className="hyperdrive hd-pause-layout" role="application" aria-label={t("hyperdrive")} data-nav-lock>
        <div className="hd-pause-grid">
          <aside className="hd-panel hd-orig">
            <header className="hd-panel-h">
              <strong>{t("hd_orig_pause")}</strong>
              <span className="muted">
                {title} · {Math.round(pct)}%
              </span>
            </header>
            <p className="hd-pause-mark muted">
              {t("hd_stop_at").replace("{0}", String(pos))}
            </p>
            <div className="hd-ctx">
              {ctx.map((w, i) => (
                <span key={`${i}-${w.text}`} className={w.cur ? "hd-cur" : undefined}>
                  {w.text}{" "}
                </span>
              ))}
            </div>
          </aside>

          <aside className="hd-panel hd-tr-panel">
            <header className="hd-panel-h">
              <strong>{t("hd_translation")}</strong>
              <span className="muted">EN → RU</span>
            </header>
            <p className="muted hd-tr-cap">{t("hd_ctx_tr")}</p>
            <div className="hd-ctx hd-ctx-tr">{ctxTr || "…"}</div>
          </aside>

          <aside className="hd-panel hd-side">
            <div className="hd-speed-box">
              <h3>{t("hd_speed")}</h3>
              <div className="hd-speed-row">
                <button type="button" className="hud-btn" onClick={() => { rampRef.current.manual(-25); setDisplayWpm(Math.round(rampRef.current.wpm)); }}>
                  ▼
                </button>
                <div>
                  <div className="hd-wpm">{displayWpm}</div>
                  <div className="hd-wpm-sub">{t("hd_wpm")}</div>
                </div>
                <button type="button" className="hud-btn" onClick={() => { rampRef.current.manual(25); setDisplayWpm(Math.round(rampRef.current.wpm)); }}>
                  ▲
                </button>
              </div>
              <p className="muted">
                {startWpm} → {targetWpm} · ±25
              </p>
            </div>

            <div className="hd-settings-box">
              <h3>{t("hd_flight_set")}</h3>
              <label className="hd-tog">
                <span>{t("hd_font")}</span>
                <span>
                  <button type="button" className="hud-btn" onClick={() => setFontPt((p) => Math.max(22, p - 4))}>A−</button>
                  <strong> {fontPt} </strong>
                  <button type="button" className="hud-btn" onClick={() => setFontPt((p) => Math.min(72, p + 4))}>A+</button>
                </span>
              </label>
              <label className="hd-tog">
                <span>{t("hd_chunk")}</span>
                <span className="hd-chunk-btns">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`hud-btn ${chunk === n ? "amber" : ""}`}
                      onClick={() => {
                        setChunk(n);
                        chunkRef.current = n;
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </span>
              </label>
              <label className="hd-tog">
                <span>{t("hd_orp")}</span>
                <button type="button" className={`hud-btn ${orpOn ? "ok" : ""}`} onClick={() => setOrpOn((v) => !v)}>
                  {orpOn ? t("on") : t("off")}
                </button>
              </label>
              <label className="hd-tog">
                <span>{t("hd_guides")}</span>
                <button type="button" className={`hud-btn ${guidesOn ? "ok" : ""}`} onClick={() => setGuidesOn((v) => !v)}>
                  {guidesOn ? t("on") : t("off")}
                </button>
              </label>
              <label className="hd-tog">
                <span>{t("hd_under_word")}</span>
                <button type="button" className={`hud-btn ${translateOn ? "ok" : ""}`} onClick={() => setTranslateOn((v) => !v)}>
                  {translateOn ? t("on") : t("off")}
                </button>
              </label>
            </div>

            <div className="hd-tele">
              <h3>{t("hd_telemetry")}</h3>
              <p>
                {mm}:{ss} · {avgWpm} · {wordsRead}
              </p>
            </div>
          </aside>
        </div>

        <footer className="hd-pause-foot">
          <button type="button" className="hud-btn amber" onClick={() => setRunning(true)}>
            ▶ {t("hd_continue")}
          </button>
          <button type="button" className="hud-btn" onClick={() => { const b = prevSentence(words, pos); posRef.current = b; showFrame(b); }}>
            {t("hd_back")}
          </button>
          <button type="button" className="hud-btn" onClick={() => { posRef.current = 0; showFrame(0); }}>
            {t("hd_chapter_home")}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              onFinished?.({ wpm: displayWpm, words: pos, elapsed: flyAccum.current });
              onExit();
            }}
          >
            {t("hd_finish")}
          </button>
          {onOpenBook ? (
            <button type="button" className="hud-btn" onClick={onOpenBook}>
              {t("sr_book")}
            </button>
          ) : null}
          {onOpenLibrary ? (
            <button type="button" className="hud-btn" onClick={onOpenLibrary}>
              {t("library")}
            </button>
          ) : null}
        </footer>
      </section>
    );
  }

  return (
    <section
      className="hyperdrive is-run"
      onClick={() => setRunning(false)}
      role="application"
      aria-label={t("hyperdrive")}
      data-nav-lock
    >
      <header className="hd-top">
        <span className="hd-title">
          {t("hyperdrive")} · {title.toUpperCase()}
        </span>
        <span className={`hd-mode ${translateOn ? "on" : ""}`}>
          {translateOn ? t("hd_with_tr") : t("hd_focus")} · {t("hd_click_pause")}
        </span>
      </header>

      <div className="hd-stage">
        <div className={`hd-focus ${translateOn ? "has-tr" : ""}`}>
          {guidesOn ? (
            <div className="hd-guides" aria-hidden>
              <div className="hd-guide-h top" />
              <div className="hd-guide-v top" />
              <div className="hd-guide-h bot" />
              <div className="hd-guide-v bot" />
            </div>
          ) : null}
          <div className="hd-word" style={{ fontSize: `${fontPt}px` }}>
            <span>{orpOn ? left : ""}</span>
            <span className={orpOn ? "hd-orp" : undefined}>{orpOn ? mid : frame.text}</span>
            <span>{orpOn ? right : ""}</span>
          </div>
          {translateOn ? <div className="hd-tr">{tr || "\u00a0"}</div> : null}
        </div>
        <div className="hd-wpm-block">
          <div className="hd-wpm">{displayWpm}</div>
          <div className="hd-wpm-sub">
            {t("hd_wpm")}
            {rampRef.current.ramping ? ` · ↗ ${t("hd_to").replace("{0}", String(Math.round(rampRef.current.target)))}` : ""}
          </div>
        </div>
      </div>

      <footer className="hd-foot">
        <div className="hd-route">
          {t("hd_route")
            .replace("{0}", String(pos.toLocaleString("ru-RU")))
            .replace("{1}", String(n.toLocaleString("ru-RU")))
            .replace("{2}", String(Math.round(pct)))}
        </div>
        <div className="hd-ramp">
          {rampMode === "off"
            ? t("hd_const")
            : rampRef.current.ramping
              ? rampMode === "steps"
                ? t("hd_ramp_steps")
                : t("hd_ramp").replace("{0}", String(rampStep)).replace("{1}", String(rampEveryS))
              : displayWpm < targetWpm
                ? t("hd_plateau")
                : t("hd_const")}
        </div>
        <div className="hd-bar" aria-hidden>
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="hd-hotkeys muted">{t("hd_hotkeys")}</p>
      </footer>
    </section>
  );
}
