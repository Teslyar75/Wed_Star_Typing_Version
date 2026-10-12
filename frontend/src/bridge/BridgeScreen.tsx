import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DONE, ERROR, TypingEngine } from "../typing/engine";
import { FINGER_COLORS, keyForChar, ROWS } from "../typing/layouts";

type Segment = { idx: number; original: string; translation: string; status: string };

const WINDOW = 48; // символов вокруг курсора (виртуализация строки)

export default function BridgeScreen() {
  const [textId, setTextId] = useState<number | null>(null);
  const [raw, setRaw] = useState("the quick brown fox jumps over the lazy dog");
  const [lang, setLang] = useState("en");
  const [engine, setEngine] = useState(() => new TypingEngine(raw));
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState("К ЗАПУСКУ ГОТОВ");
  const inputRef = useRef<HTMLInputElement>(null);
  const now = () => performance.now() / 1000;

  const reloadEngine = useCallback((t: string) => {
    setEngine(new TypingEngine(t));
    setStatus("К ЗАПУСКУ ГОТОВ");
    setTick((x) => x + 1);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [engine]);

  const loadPractice = async () => {
    const content = raw.trim() || "hello world";
    const r = await fetch("/api/texts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "practice", lang, content }),
    });
    if (!r.ok) return;
    const doc = await r.json();
    setTextId(doc.id);
    const segs: Segment[] = await (await fetch(`/api/texts/${doc.id}/segments?limit=500`)).json();
    const joined = segs.map((s) => s.original).join(" ");
    setRaw(joined);
    reloadEngine(joined);
  };

  const saveSession = async (eng: TypingEngine) => {
    const seg = eng.segment(now());
    await fetch("/api/sessions", {
      method: "POST",
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
      setStatus(engine.paused ? "❚❚ ПАУЗА" : "● В ПОЛЁТЕ");
      setTick((x) => x + 1);
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const ch = e.key.length === 1 ? e.key : e.key === " " ? " " : "";
    if (!ch) return;
    e.preventDefault();
    const t0 = performance.now();
    const res = engine.press(ch, now());
    if (res === null) return;
    if (res === ERROR) {
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
    } else {
      setStatus(res === DONE ? "ФИНИШ" : "● В ПОЛЁТЕ");
    }
    setTick((x) => x + 1);
    if (res === DONE) void saveSession(engine);
    // критерий: обработка < 16 мс
    void t0;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, engine]);

  return (
    <section className="bridge">
      <div className="bridge-toolbar">
        <textarea
          className="cargo-input"
          rows={3}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Вставьте текст для набора…"
        />
        <div className="bridge-actions">
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <button type="button" className="hud-btn" onClick={() => void loadPractice()}>
            На борт
          </button>
          <button type="button" className="hud-btn amber" onClick={() => reloadEngine(raw)}>
            Заново
          </button>
        </div>
      </div>

      <div className={`viewport ${flash ? "flash" : ""}`} onClick={() => inputRef.current?.focus()}>
        <span className="muted">{slice.slice(0, cursorLocal)}</span>
        <span className="cursor">{engine.current ?? "¶"}</span>
        <span className="ahead">{slice.slice(cursorLocal + (engine.finished ? 0 : 1))}</span>
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
        <div><span className="lab">статус</span> {status}</div>
        <div><span className="lab">CPM</span> {stats.cpm} <span className="muted">мгн {stats.inst}</span></div>
        <div><span className="lab">точн.</span> {stats.acc}%</div>
        <div><span className="lab">ошибки</span> {stats.err}</div>
        <div><span className="lab">время</span> {stats.el}с</div>
        <div><span className="lab">прогресс</span> {Math.round(engine.progress * 100)}%</div>
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
      <p className="hint">Esc — пауза · клик по иллюминатору — фокус · после финиша сессия уходит на сервер</p>
    </section>
  );
}
