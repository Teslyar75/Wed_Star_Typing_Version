/** Дзен-портал Ctrl+M — порт stamina/zen.py (serika dark, текст с мостика). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, getLang } from "../i18n";
import { COUNTS, PortalTest, prepareWords, quoteSlice } from "./zenEngine";
import { useZen, type ZenMode } from "./zenStore";
import AccountView from "./AccountView";
import type { PortalPack } from "./types";

const ESC_DOUBLE_MS = 400;
const SERIKA = { bg: "#323437", sub: "#646669", subalt: "#2c2e31", text: "#d1d0c5", main: "#e2b714", caret: "#e2b714", error: "#ca4754", extra: "#7e2a33" };
const FALLBACK = "the of and to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part".split(" ");
const LANGS: Record<string, string> = { en: "english", ru: "russian", uk: "ukrainian", de: "german" };

type Src = { words: string[]; ends: number[]; raw: string; base: number; fallback: boolean };

function loadSrc(text: string, index: number, punct: boolean, numbers: boolean): Src {
  let pos = Math.max(0, Math.min(index, text.length));
  while (pos > 0 && text[pos - 1] && !/\s/.test(text[pos - 1]!)) pos -= 1;
  const raw = text.slice(pos, pos + 60000);
  const words: string[] = [];
  const ends: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const w = prepareWords(m[0]!, punct, numbers);
    if (w.length) {
      words.push(w[0]!);
      ends.push(m.index + m[0]!.length);
    }
  }
  const fallback = !words.length;
  return { words: fallback ? [...FALLBACK] : words, ends, raw, base: pos, fallback };
}

export default function ZenOverlay() {
  const prefs = useZen((s) => s.prefs);
  const bridge = useZen((s) => s.bridge);
  const close = useZen((s) => s.close);
  const setPrefs = useZen((s) => s.setPrefs);

  const srcRef = useRef<Src>({ words: FALLBACK, ends: [], raw: "", base: 0, fallback: true });
  const posRef = useRef(0);
  const startRef = useRef(0);
  const carriedRef = useRef(0);
  const startedMarked = useRef(false);
  const testRef = useRef<PortalTest | null>(null);
  const escAt = useRef(0);
  const escTimer = useRef<number | 0>(0);
  const topWord = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<ReturnType<PortalTest["result"]> | null>(null);
  const [showAcct, setShowAcct] = useState(false);
  const [acct, setAcct] = useState<PortalPack | null>(null);
  const [focus, setFocus] = useState(false);
  const [blink, setBlink] = useState(true);
  const lastKey = useRef(performance.now());

  const pal = SERIKA;
  const mode = prefs.mode;
  const count = mode === "time" ? prefs.counts.time : mode === "custom" ? prefs.counts.custom : prefs.counts.words;

  const take = (n: number) => {
    const out: string[] = [];
    const src = srcRef.current;
    while (out.length < n) {
      if (posRef.current >= src.words.length) posRef.current = 0;
      out.push(src.words[posRef.current]!);
      posRef.current += 1;
    }
    return out;
  };

  const newTest = useCallback((same = false) => {
    const src = srcRef.current;
    let start = posRef.current;
    if (same && testRef.current) {
      start = startRef.current;
      posRef.current = start;
    }
    startRef.current = start;
    carriedRef.current = 0;
    startedMarked.current = false;
    topWord.current = 0;
    let n = 10;
    let limit = 0;
    const m = useZen.getState().prefs.mode;
    const counts = useZen.getState().prefs.counts;
    if (m === "time") {
      n = 300;
      limit = counts.time;
    } else if (m === "words") {
      n = limit = counts.words;
    } else if (m === "custom") {
      n = limit = counts.custom;
    } else if (m === "quote") {
      n = quoteSlice(src.words.join(" "), start) || 25;
      limit = n;
    } else {
      n = Math.min(400, Math.max(1, src.words.length - start));
      limit = 0;
    }
    const words = take(n);
    const te = new PortalTest(words, m === "time" || m === "words" ? m : "words", limit);
    (te as PortalTest & { ui_mode?: string }).ui_mode = m;
    testRef.current = te;
    setResult(null);
    setFocus(false);
    setTick((x) => x + 1);
  }, []);

  const carry = useCallback(() => {
    const te = testRef.current;
    const br = useZen.getState().bridge;
    const src = srcRef.current;
    if (!te || !br || src.fallback || !te.started) return false;
    let done = te.wi + (te.wi < te.inputs.length && te.inputs[te.wi] === te.words[te.wi] && te.wi === te.words.length - 1 ? 1 : 0);
    done = Math.min(done, src.words.length - startRef.current);
    if (done <= carriedRef.current) return false;
    const k1 = startRef.current + done;
    let end = src.ends[k1 - 1] ?? 0;
    while (end < src.raw.length && /\s/.test(src.raw[end] || "")) end += 1;
    let ok = 0;
    let bad = 0;
    for (let k = carriedRef.current; k < done; k++) {
      const w = te.words[k] || "";
      const inp = te.inputs[k] || "";
      let good = 0;
      for (let i = 0; i < Math.min(w.length, inp.length); i++) if (w[i] === inp[i]) good += 1;
      ok += good + 1;
      bad += Math.max(w.length, inp.length) - good;
    }
    const el = te.elapsed() * ((done - carriedRef.current) / Math.max(1, done));
    carriedRef.current = done;
    posRef.current = k1;
    return br.advanceTo(src.base + end, { typed: ok + bad, errors: bad, elapsed: el });
  }, []);

  const finish = useCallback(() => {
    carry();
    const te = testRef.current;
    if (!te) return;
    if (!te.finished) te.finish();
    const res = te.result();
    const ui = (te as PortalTest & { ui_mode?: string }).ui_mode || te.mode;
    res.mode = ui;
    const lang = LANGS[useZen.getState().bridge?.getLang() || getLang()] || "english";
    void fetch("/api/portal/result", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...res, language: lang, chars: {}, words: res.words }),
    });
    setResult(res);
    setFocus(false);
    setTick((x) => x + 1);
  }, [carry]);

  useEffect(() => {
    const br = useZen.getState().bridge;
    const pr = useZen.getState().prefs;
    srcRef.current = loadSrc(br?.getText() || "", br?.getIndex() || 0, pr.punct, pr.numbers);
    posRef.current = 0;
    newTest(false);
    void fetch("/api/portal", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p) setAcct(p as PortalPack); });
    inputRef.current?.focus();
    return () => {
      carry();
    };
  }, [newTest, carry]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const te = testRef.current;
      if (te && te.started && !te.finished) {
        te.tick();
        if (te.finished) finish();
        else setTick((x) => x + 1);
      }
      const idle = performance.now() - lastKey.current > 1000;
      setBlink(!idle || Math.floor(performance.now() / 500) % 2 === 0);
    }, 100);
    return () => clearInterval(id);
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyM") return;
      if (showAcct) {
        if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          setShowAcct(false);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (escTimer.current) {
          window.clearTimeout(escTimer.current);
          escTimer.current = 0;
          close();
          return;
        }
        if (now - escAt.current <= ESC_DOUBLE_MS && escAt.current) {
          close();
          return;
        }
        escAt.current = now;
        escTimer.current = window.setTimeout(() => {
          escTimer.current = 0;
          const te = testRef.current;
          newTest(!(te && te.finished));
        }, ESC_DOUBLE_MS);
        return;
      }
      const te = testRef.current;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (te?.finished) newTest(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (te?.finished) newTest(false);
        else if (e.shiftKey && te?.started) finish();
        return;
      }
      if (!te || te.finished) {
        e.stopPropagation();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        te.backspace(e.ctrlKey || e.metaKey);
        lastKey.current = performance.now();
        setTick((x) => x + 1);
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      const was = te.started;
      te.typeChar(e.key);
      lastKey.current = performance.now();
      if (te.started && !was && !startedMarked.current) {
        startedMarked.current = true;
        void fetch("/api/portal/started", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      }
      if (te.started && !focus) setFocus(true);
      if (te.finished) finish();
      else setTick((x) => x + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, finish, newTest, showAcct, focus]);

  useEffect(() => {
    document.documentElement.classList.add("zen-lock");
    document.body.classList.add("zen-lock");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.documentElement.classList.remove("zen-lock");
      document.body.classList.remove("zen-lock");
      document.body.style.overflow = prev;
    };
  }, []);

  const te = testRef.current;
  const wordsView = useMemo(() => {
    if (!te) return null;
    const vis = te.words.slice(0, Math.min(te.words.length, topWord.current + 80));
    return vis.map((w, k) => {
      const inp = te.inputs[k] || "";
      const current = k === te.wi && !te.finished;
      const chars: { ch: string; cls: string }[] = [];
      const n = Math.max(w.length, inp.length);
      for (let i = 0; i < n; i++) {
        if (i < inp.length && i < w.length) chars.push({ ch: w[i]!, cls: inp[i] === w[i] ? "ok" : "bad" });
        else if (i < inp.length) chars.push({ ch: inp[i]!, cls: "extra" });
        else chars.push({ ch: w[i]!, cls: current && i === inp.length ? "caret" : "wait" });
      }
      if (current && inp.length >= w.length) chars.push({ ch: " ", cls: "caret" });
      return { k, w, current, err: inp && inp !== w && (k < te.wi || (current && inp.length >= w.length)), chars };
    });
    // tick forces refresh
  }, [te, tick]);

  const setMode = (m: ZenMode) => {
    setPrefs({ mode: m });
    window.setTimeout(() => newTest(false), 0);
  };
  const setCount = (n: number) => {
    const m = useZen.getState().prefs.mode;
    const key = m === "time" ? "time" : m === "custom" ? "custom" : "words";
    setPrefs({ counts: { ...useZen.getState().prefs.counts, [key]: n } });
    window.setTimeout(() => newTest(false), 0);
  };
  const toggleFlag = (k: "punct" | "numbers") => {
    setPrefs({ [k]: !useZen.getState().prefs[k] });
    const br = useZen.getState().bridge;
    const pr = useZen.getState().prefs;
    srcRef.current = loadSrc(br?.getText() || srcRef.current.raw, br?.getIndex() || 0, pr.punct, pr.numbers);
    posRef.current = 0;
    newTest(false);
  };


  const lang = LANGS[bridge?.getLang() || getLang()] || "english";
  const pace = acct?.pace;
  const nick = acct?.username || acct?.summary?.name || "pilot";
  const lvl = acct?.summary?.level || "";

  const setSrc = async (src: "all" | "st" | "mt") => {
    const r = await fetch("/api/portal/creds", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: acct?.username || "", src }),
    });
    if (r.ok) setAcct((await r.json()) as PortalPack);
  };

  const tree = (
    <div
      className="zen-portal"
      style={{ position: "fixed", inset: 0, zIndex: 40000, background: pal.bg, color: pal.text }}
      onMouseDown={() => inputRef.current?.focus()}
    >
      <input ref={inputRef} className="zen-ghost" autoFocus autoComplete="off" />
      <button type="button" className="zen-back" onClick={() => close()}>
        ⟵ {t("zen_to_bridge")}
      </button>

      <div className="zen-top">
        <button type="button" className="zen-logo" onClick={() => setShowAcct(true)}>
          <span className="zen-logo-mark" aria-hidden>
            <i /><i /><i />
            <b>✦</b>
          </span>
          <span className="zen-logo-name">
            <small>pilot see</small>
            <strong>star typing</strong>
          </span>
        </button>
        <nav className="zen-nav">
          <button type="button" title="test">⌨</button>
          <button type="button" className={showAcct ? "on" : ""} title="account" onClick={() => setShowAcct(true)}>♛</button>
          <button type="button" title="info">ⓘ</button>
          <button type="button" title="settings">⚙</button>
        </nav>
        <button type="button" className="zen-user" onClick={() => setShowAcct(true)}>
          {nick}
          {lvl ? <em>{lvl}</em> : null}
        </button>
      </div>

      {showAcct ? (
        <div className="zen-acct-page">
          <div className="zen-acct-bar">
            {(["all", "st", "mt"] as const).map((k) => (
              <button key={k} type="button" className={(acct?.src || "all") === k ? "on" : ""} onClick={() => void setSrc(k)}>
                {k === "all" ? t("mt_tab_all") : k === "st" ? t("mt_tab_st") : t("mt_tab_mt")}
              </button>
            ))}
            <button type="button" className="zen-back-test" onClick={() => setShowAcct(false)}>
              esc — {t("zen_back_test")}
            </button>
          </div>
          <AccountView
            summary={acct?.summary}
            empty={t("mt_empty")}
            pal={{ bg: pal.bg, sub: pal.sub, subalt: pal.subalt, text: pal.text, main: pal.main }}
            onNameClick={() => {
              const name = (acct?.username || "").trim();
              if (name) window.open("https://monkeytype.com/profile/" + encodeURIComponent(name), "_blank", "noopener");
            }}
          />
        </div>
      ) : (
        <>
          {!focus && (
            <header className="zen-chrome">
              <div className="zen-pill">
                <button type="button" className={prefs.punct ? "on" : ""} onClick={() => toggleFlag("punct")}>
                  @ punctuation
                </button>
                <button type="button" className={prefs.numbers ? "on" : ""} onClick={() => toggleFlag("numbers")}>
                  # numbers
                </button>
              </div>
              <div className="zen-pill">
                {(["time", "words", "quote", "zen", "custom"] as const).map((m) => (
                  <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                    {m === "time" ? "◷ time" : m === "words" ? "A words" : m === "quote" ? "❝ quote" : m === "zen" ? "▲ zen" : "⚒ custom"}
                  </button>
                ))}
              </div>
              {mode in COUNTS ? (
                <div className="zen-pill">
                  {(COUNTS as Record<string, readonly number[]>)[mode]!.map((n) => (
                    <button key={n} type="button" className={count === n ? "on" : ""} onClick={() => setCount(n)}>
                      {n}
                    </button>
                  ))}
                  <button type="button">⚒</button>
                </div>
              ) : null}
            </header>
          )}

          {te && te.started && !te.finished ? <div className="zen-counter">{te.progressLabel()}</div> : null}
          {!focus && !(te && te.started) ? (
            <div className="zen-meta">
              ◍  {lang}
              {pace ? `      ◔  average pace ${pace} wpm` : ""}
            </div>
          ) : null}

          {result ? (
            <div className="zen-result">
              <div><span>wpm</span><strong>{Math.round(result.wpm)}</strong></div>
              <div><span>acc</span><strong>{Math.round(result.acc)}%</strong></div>
              <div><span>raw</span><strong>{Math.round(result.raw)}</strong></div>
              <div><span>cons</span><strong>{Math.round(result.consistency)}</strong></div>
            </div>
          ) : (
            <div className={`zen-words ${blink ? "" : "caret-off"}`} aria-hidden>
              {wordsView?.map((w) => (
                <span key={w.k} className={`zen-w ${w.current ? "cur" : ""} ${w.err ? "errw" : ""}`}>
                  {w.chars.map((c, i) => (
                    <i key={i} className={c.cls}>{c.ch}</i>
                  ))}{" "}
                </span>
              ))}
            </div>
          )}

          {!focus ? (
            <footer className="zen-hints">
              <div><kbd>esc</kbd> - restart test</div>
              <div><kbd>tab</kbd> or <kbd>ctrl + shift + p</kbd> - command line</div>
              <div><kbd>esc esc</kbd> / <kbd>ctrl+m</kbd> - {t("zen_to_bridge")}</div>
            </footer>
          ) : null}
        </>
      )}

      {!focus ? (
        <div className="zen-foot">
          <span>✉ contact</span>
          <span>♡ support</span>
          <span>‹› github</span>
          <span>◎ discord</span>
          <span>✦ twitter</span>
          <span>☰ terms</span>
          <span>⛨ security</span>
          <span>◐ privacy</span>
          <span>◐ serika dark</span>
        </div>
      ) : null}
    </div>
  );

  return createPortal(tree, document.body);
}
