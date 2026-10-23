/** Портал — экран в духе Monkeytype (порт desktop stamina/zen.py). Свой код, без логотипа/кода Monkeytype. */
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./zen.css";
import AccountView from "./AccountView";
import { markStarted, postResult } from "./portalApi";
import { useMt } from "./mtStore";
import { COUNTS, PortalTest, prepareWords, quoteLen, type SrcWord, type ZenMode, type ZenResult } from "./zenEngine";
import { zt } from "./zenI18n";

type Caret = "underline" | "line" | "block";
type Cfg = { mode: ZenMode; time: number; words: number; custom: number; punctuation: boolean; numbers: boolean; caret: Caret };
const CFG_KEY = "st_zen_cfg";
const ASKED_KEY = "st_zen_mt_asked";
const DEF: Cfg = { mode: "words", time: 30, words: 25, custom: 50, punctuation: false, numbers: false, caret: "underline" };

function loadCfg(): Cfg {
  try {
    return { ...DEF, ...(JSON.parse(localStorage.getItem(CFG_KEY) || "{}") as Partial<Cfg>) };
  } catch {
    return DEF;
  }
}

type Props = {
  text: string;
  index: number;
  /** Верно набранное продвигает мостик: новая позиция в символах text. */
  onAdvance: (newIndex: number) => void;
  onExit: () => void;
};

function buildTest(cfg: Cfg, text: string, index: number): { test: PortalTest; src: SrcWord[] } {
  const n =
    cfg.mode === "words" ? cfg.words
      : cfg.mode === "custom" ? cfg.custom
        : cfg.mode === "quote" ? quoteLen(text, index)
          : cfg.mode === "time" ? Math.max(100, cfg.time * 4) : 1000;
  let src = prepareWords(text, index, { punctuation: cfg.punctuation, numbers: cfg.numbers, limit: n });
  if (!src.length) src = prepareWords(text, 0, { punctuation: cfg.punctuation, numbers: cfg.numbers, limit: n });
  const limit = cfg.mode === "time" ? cfg.time : cfg.mode === "zen" ? 0 : src.length;
  return { test: new PortalTest(src.map((s) => s.word), cfg.mode, limit), src };
}

function Chart({ r }: { r: ZenResult }) {
  const s = r.samples.length ? r.samples : [{ wpm: r.wpm, raw: r.raw, err: 0 }];
  const W = 900, H = 180, P = 30;
  const max = Math.max(10, ...s.map((x) => Math.max(x.wpm, x.raw))) * 1.1;
  const x = (i: number) => P + (s.length < 2 ? 0 : (i / (s.length - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (k: "wpm" | "raw") => s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg className="zen-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="wpm chart">
      {[0, 0.25, 0.5, 0.75, 1].map((k) => (
        <g key={k}><line x1={P} x2={W - P} y1={y(max * k)} y2={y(max * k)} className="grid" />
          <text x={4} y={y(max * k) + 4}>{Math.round(max * k)}</text></g>
      ))}
      <path d={line("raw")} className="raw" />
      <path d={line("wpm")} className="wpm" />
      {s.map((p, i) => (p.err ? <text key={i} x={x(i) - 4} y={y(p.raw) - 6} className="err">×</text> : null))}
    </svg>
  );
}

export default function ZenPortal({ text, index, onAdvance, onExit }: Props) {
  const [cfg, setCfg] = useState<Cfg>(loadCfg);
  const idxRef = useRef(index);
  idxRef.current = index;
  const [{ test, src }, setRun] = useState(() => buildTest(cfg, text, index));
  const [, bump] = useState(0);
  const [result, setResult] = useState<ZenResult | null>(null);
  const stats = useMt((m) => m.stats);
  const [account, setAccount] = useState(false);
  const [tabArmed, setTabArmed] = useState(false);
  const lastEsc = useRef(0);
  const advancedFor = useRef<PortalTest | null>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [caretBox, setCaretBoxRaw] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const setCaretBox = useCallback((b: { x: number; y: number; w: number; h: number }) => {
    setCaretBoxRaw((o) => (o && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h ? o : b));
  }, []);

  useEffect(() => localStorage.setItem(CFG_KEY, JSON.stringify(cfg)), [cfg]);

  /* Тихая read-only синхронизация с Monkeytype при входе (общий троттлинг 5 мин), ник спрашиваем один раз. */
  useEffect(() => {
    void (async () => {
      const m = useMt.getState();
      if (!m.stats) await m.load();
      const s = useMt.getState().stats;
      if (s && !s.mt_username && !localStorage.getItem(ASKED_KEY)) {
        localStorage.setItem(ASKED_KEY, "1");
        const name = (window.prompt(zt("mt_prompt")) || "").trim();
        if (name) { await useMt.getState().setUser(name); return; }
      }
      await useMt.getState().sync();
    })();
  }, []);

  /** Вернуть верно набранное на мостик (один раз за тест). */
  const advance = useCallback((t: PortalTest) => {
    if (advancedFor.current === t) return;
    advancedFor.current = t;
    const k = t.lastCorrectWord();
    if (k >= 0 && src[k] && src[k]!.end > idxRef.current) {
      idxRef.current = src[k]!.end;
      onAdvance(src[k]!.end);
    }
  }, [onAdvance, src]);

  const restart = useCallback((c: Cfg = cfg) => {
    if (test.started && !test.finished) advance(test);
    setResult(null);
    setScroll(0);
    // позиция мостика могла сдвинуться — строим от неё
    setRun(buildTest(c, text, idxRef.current));
  }, [cfg, test, text, advance]);

  const exit = useCallback(() => {
    if (test.started && !test.finished) advance(test);
    onExit();
  }, [test, advance, onExit]);

  const finishTest = useCallback(() => {
    const r = test.result();
    setResult(r);
    advance(test);
    void postResult(r).then(async (s) => {
      useMt.getState().put(s);
      await useMt.getState().sync();
    });
  }, [test, advance]);

  /* Таймер/посекундные отсчёты */
  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => {
      if (!test.started || test.finished) return;
      test.tick();
      if (test.finished) finishTest();
      bump((x) => x + 1);
    }, 100);
    return () => clearInterval(id);
  }, [test, result, finishTest]);

  const setC = (p: Partial<Cfg>) => {
    const c = { ...cfg, ...p };
    setCfg(c);
    restart(c);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (account) {
        if (e.key === "Escape") { e.preventDefault(); setAccount(false); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M" || e.code === "KeyM")) {
        e.preventDefault(); e.stopPropagation(); exit(); return;
      }
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        const t = performance.now();
        if (t - lastEsc.current < 600) { exit(); return; }
        lastEsc.current = t;
        restart();
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); setTabArmed(true); return; }
      if (e.key === "Enter" && tabArmed) { e.preventDefault(); setTabArmed(false); restart(); return; }
      setTabArmed(false);
      if (result) return;
      if (e.key === "Backspace") {
        e.preventDefault(); e.stopPropagation();
        test.backspace(e.ctrlKey || e.altKey); bump((x) => x + 1); return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      e.preventDefault(); e.stopPropagation();
      const wasStarted = test.started;
      test.typeChar(e.key);
      if (!wasStarted && test.started) markStarted();
      if (test.finished) finishTest();
      bump((x) => x + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [account, exit, restart, tabArmed, result, test, finishTest]);

  /* Каретка и прокрутка: 3 видимые строки, активная — на второй */
  useLayoutEffect(() => {
    const box = wordsRef.current;
    if (!box || result) return;
    const w = box.querySelector<HTMLElement>(".zen-word.active");
    if (!w) return;
    const lineH = w.offsetHeight + 4;
    const top = w.offsetTop;
    const want = Math.max(0, top - lineH);
    if (want !== scroll && top - scroll > lineH * 1.5) setScroll(want);
    else if (top < scroll) setScroll(Math.max(0, top - lineH));
    const inp = test.inputs[test.wi] || "";
    const letters = w.querySelectorAll<HTMLElement>(".zen-l");
    const at = letters[inp.length];
    if (at) setCaretBox({ x: at.offsetLeft, y: top, w: at.offsetWidth, h: at.offsetHeight });
    else {
      const last = letters[letters.length - 1];
      const cw = last ? last.offsetWidth : 12;
      setCaretBox({ x: last ? last.offsetLeft + last.offsetWidth : w.offsetLeft, y: top, w: cw, h: last?.offsetHeight || 24 });
    }
  });

  const counts = cfg.mode === "time" ? COUNTS.time : cfg.mode === "words" ? COUNTS.words : null;
  const typing = test.started && !test.finished;
  const pace = stats?.average_pace;

  const wordsView = useMemo(() => test.words.map((w, i) => {
    const inp = test.inputs[i] ?? "";
    const typed = i < test.wi;
    const err = typed && inp !== w;
    const letters = [];
    for (let j = 0; j < Math.max(w.length, inp.length); j++) {
      let cls = "zen-l";
      if (j >= w.length) cls += " extra";
      else if (j < inp.length) cls += inp[j] === w[j] ? " ok" : " bad";
      letters.push(<span key={j} className={cls}>{j < w.length ? w[j] : inp[j]}</span>);
    }
    return <div key={i} className={`zen-word${i === test.wi ? " active" : ""}${err ? " error" : ""}`}>{letters}</div>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [test, test.wi, test.inputs[test.wi], test.inputs.length]);

  const askCustom = () => {
    const v = Number(window.prompt(zt("custom_prompt"), String(cfg.mode === "time" ? cfg.time : cfg.words)));
    if (!Number.isFinite(v) || v < 5 || v > 1000) return;
    const n = Math.round(v);
    if (cfg.mode === "time") setC({ time: n });
    else setC({ mode: cfg.mode === "words" ? "words" : "custom", words: n, custom: n });
  };



  return createPortal(
    <div className={`zen-root${typing ? " typing" : ""}`} role="application" aria-label="portal">
      <div className="zen-inner">
        <header className="zen-top">
          <div className="zen-logo" title="Star Typing">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2l2.6 6.3 6.8.6-5.2 4.5 1.6 6.6L12 16.6 6.2 20l1.6-6.6L2.6 8.9l6.8-.6z" /></svg>
            <div><small>star</small><span>star typing</span></div>
          </div>
          <nav className="zen-icons">
            <button type="button" title="test" onClick={() => { setAccount(false); restart(); }}>⌨</button>
            <button type="button" title={zt("account")} onClick={() => setAccount(true)}>♛</button>
            <button type="button" title="info" onClick={() => window.alert(zt("help"))}>ⓘ</button>
            <button type="button" title={zt("caret")} onClick={() => setCfg({ ...cfg, caret: cfg.caret === "underline" ? "line" : cfg.caret === "line" ? "block" : "underline" })}>⚙</button>
          </nav>
          <span className="zen-spacer" />
          <button type="button" className="zen-back" onClick={exit}>{zt("back")}</button>
          <button type="button" className="zen-user" onClick={() => setAccount(true)}>
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>
            {stats?.mt_username || stats?.ours.name || "pilot"}
          </button>
        </header>

        {account ? (
          <AccountView onClose={() => setAccount(false)} />
        ) : result ? (
          <main className="zen-result">
            <div className="zen-res-top">
              <div className="zen-res-big">
                <div><div className="zen-sub">wpm</div><div className="zen-huge">{Math.round(result.wpm)}</div></div>
                <div><div className="zen-sub">acc</div><div className="zen-huge">{Math.round(result.acc)}%</div></div>
              </div>
              <Chart r={result} />
            </div>
            <div className="zen-res-row">
              <div><div className="zen-sub">test type</div><div className="zen-mid">{result.mode} {result.mode2 || ""}<br /><small>english</small></div></div>
              <div><div className="zen-sub">raw</div><div className="zen-mid">{Math.round(result.raw)}</div></div>
              <div><div className="zen-sub">characters</div><div className="zen-mid">{result.chars.correct}/{result.chars.incorrect}/{result.chars.extra}/{result.chars.missed}</div></div>
              <div><div className="zen-sub">consistency</div><div className="zen-mid">{Math.round(result.consistency)}%</div></div>
              <div><div className="zen-sub">time</div><div className="zen-mid">{Math.round(result.time)}s</div></div>
            </div>
            <div className="zen-res-actions"><button type="button" onClick={() => restart()} title="next test">❯</button><button type="button" onClick={() => restart()} title="restart">↻</button></div>
          </main>
        ) : (
          <main className="zen-test">
            <div className="zen-config">
              <button type="button" className={cfg.punctuation ? "on" : ""} onClick={() => setC({ punctuation: !cfg.punctuation })}>@ punctuation</button>
              <button type="button" className={cfg.numbers ? "on" : ""} onClick={() => setC({ numbers: !cfg.numbers })}># numbers</button>
              <i className="zen-sep" />
              {(["time", "words", "quote", "zen", "custom"] as ZenMode[]).map((m) => (
                <button key={m} type="button" className={cfg.mode === m ? "on" : ""} onClick={() => setC({ mode: m })}>
                  {{ time: "⏱", words: "A", quote: "❝", zen: "△", custom: "⚒" }[m]} {m}
                </button>
              ))}
              {counts || cfg.mode === "custom" ? <i className="zen-sep" /> : null}
              {counts?.map((n) => (
                <button key={n} type="button" className={(cfg.mode === "time" ? cfg.time : cfg.words) === n ? "on" : ""}
                  onClick={() => setC(cfg.mode === "time" ? { time: n } : { words: n })}>{n}</button>
              ))}
              {counts || cfg.mode === "custom" ? (
                <button type="button" className={counts && !counts.includes(cfg.mode === "time" ? cfg.time : cfg.words) || cfg.mode === "custom" ? "on" : ""} onClick={askCustom} title="custom">⚒</button>
              ) : null}
            </div>
            <div className="zen-lang">⌘ english{pace ? ` · ${pace} wpm average pace` : " · average pace"}</div>
            <div className="zen-counter">{test.started ? test.progressLabel() : "\u00a0"}</div>
            <div className="zen-words-wrap">
              <div className="zen-words" ref={wordsRef} style={{ transform: `translateY(${-scroll}px)` }}>
                {wordsView}
                {caretBox ? <div className={`zen-caret ${cfg.caret}${test.started ? "" : " blink"}`}
                  style={{ left: caretBox.x, top: caretBox.y, width: cfg.caret === "line" ? 2 : caretBox.w, height: caretBox.h }} /> : null}
              </div>
            </div>
            <div className="zen-restart"><button type="button" onClick={() => restart()} title="restart">↻</button></div>
          </main>
        )}

        <footer className="zen-foot">
          <div className="zen-hints">
            <span><kbd>tab</kbd> + <kbd>enter</kbd> - {zt("restart_hint")}</span>
            <span><kbd>esc</kbd> <kbd>esc</kbd> / <kbd>ctrl</kbd> + <kbd>m</kbd> - {zt("back_hint")}</span>
          </div>
          <div className="zen-links">
            <span>✉ contact</span><span>♥ support</span><span>⌥ github</span>
            <span className="zen-spacer" />
            <span>◐ serika dark</span><span>⌥ v0.2</span>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
