import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DONE, ERROR, TypingEngine } from "../typing/engine";
import { FINGER_COLORS, keyForChar, ROWS } from "../typing/layouts";
import { t, onLangChange } from "../i18n";
import { useReadingPos } from "../reading/positionStore";
import { playClick, playError, playFinish } from "../fx/sounds";

type Segment = { idx: number; original: string; translation: string; status: string; char_start?: number };

/** Окно вокруг курсора — DOM не держит весь текст (критерий 100k). */
const WINDOW = 96;

export default function BridgeScreen() {
  const jump = useReadingPos((s) => s.jump);
  const setSentence = useReadingPos((s) => s.setSentence);
  const [textId, setTextId] = useState<number | null>(null);
  const [draft, setDraft] = useState("the quick brown fox jumps over the lazy dog");
  const [lang, setLang] = useState("en");
  const [engine, setEngine] = useState(() => new TypingEngine(draft));
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState(() => t("ready"));
  const [segStarts, setSegStarts] = useState<number[]>([]);
  const [, bumpLang] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = () => performance.now() / 1000;

  const reloadEngine = useCallback((text: string) => {
    setEngine(new TypingEngine(text));
    setStatus(t("ready"));
    setTick((x) => x + 1);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [engine]);

  useEffect(() => onLangChange(() => bumpLang((x) => x + 1)), []);

  const loadPractice = async () => {
    const content = draft.trim() || "hello world";
    const r = await fetch("/api/texts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "practice", lang, content }),
    });
    if (!r.ok) return;
    const doc = await r.json();
    setTextId(doc.id);
    const segs: Segment[] = await (await fetch(`/api/texts/${doc.id}/segments?limit=2000`)).json();
    const starts: number[] = [];
    let pos = 0;
    const parts: string[] = [];
    for (const s of segs) {
      starts.push(pos);
      parts.push(s.original);
      pos += s.original.length + 1;
    }
    setSegStarts(starts);
    jump(doc.id, segs[0]?.idx ?? 0);
    const joined = parts.join(" ");
    // длинный текст не дублируем в textarea — только в engine
    if (joined.length > 4000) {
      setDraft(joined.slice(0, 400) + `… (+${joined.length - 400} симв.)`);
    } else {
      setDraft(joined);
    }
    reloadEngine(joined);
  };

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
    await fetch("/api/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text_id: textId,
        ...seg,
        mode: "cargo",
        lang,
      }),
    });
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
    const res = engine.press(ch, now());
    if (res === null) return;
    if (res === ERROR) {
      playError();
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
    } else if (res === DONE) {
      playFinish();
      setStatus(t("finish"));
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
    const t = now();
    return {
      cpm: Math.round(engine.cpm(t)),
      inst: Math.round(engine.instantCpm()),
      acc: engine.accuracy != null ? Math.round(engine.accuracy) : "—",
      err: engine.errors,
      el: engine.elapsed(t).toFixed(1),
      len: engine.text.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, engine]);

  return (
    <section className="bridge">
      <div className="bridge-toolbar">
        <textarea
          className="cargo-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("paste_text")}
        />
        <div className="bridge-actions">
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <button type="button" className="hud-btn" onClick={() => void loadPractice()}>
            {t("board")}
          </button>
          <button type="button" className="hud-btn amber" onClick={() => reloadEngine(draft.includes("… (+") ? engine.text : draft)}>
            {t("again")}
          </button>
          <span className="muted">
            {stats.len} {t("chars")}
          </span>
        </div>
      </div>

      <div className={`viewport ${flash ? "flash" : ""}`} onClick={() => inputRef.current?.focus()}>
        {start > 0 && <span className="muted">…</span>}
        <span className="muted">{slice.slice(0, cursorLocal)}</span>
        <span className="cursor">{engine.current ?? "¶"}</span>
        <span className="ahead">{slice.slice(cursorLocal + (engine.finished ? 0 : 1))}</span>
        {end < engine.text.length && <span className="muted">…</span>}
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

      <div className="telemetry">
        <div><span className="lab">{t("status")}</span> {status}</div>
        <div><span className="lab">CPM</span> {stats.cpm} <span className="muted">мгн {stats.inst}</span></div>
        <div><span className="lab">{t("accuracy")}</span> {stats.acc}%</div>
        <div><span className="lab">{t("errors")}</span> {stats.err}</div>
        <div><span className="lab">{t("time")}</span> {stats.el}с</div>
        <div><span className="lab">{t("progress")}</span> {Math.round(engine.progress * 100)}%</div>
      </div>

      <div className="keyboard" aria-hidden>
        {ROWS.map((row, ri) => (
          <div className="kb-row" key={ri}>
            {row.map(([id, en, ru, w, finger]) => {
              const active = id === highlight;
              return (
                <div
                  key={id}
                  className={`key ${active ? "active" : ""}`}
                  style={{
                    flex: w,
                    borderColor: active ? "var(--st-accent)" : FINGER_COLORS[finger],
                  }}
                >
                  <span>{lang === "ru" ? ru || en : en || ru}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="hint">{t("hint_bridge")}</p>
    </section>
  );
}
