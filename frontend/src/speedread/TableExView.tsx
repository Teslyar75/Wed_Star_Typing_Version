/**
 * Таблица Шульте / Горбова — паритет stamina/speedread/exercises.py SchulteEx.
 * Размеры колонок/панелей/сетки — как на десктопе (px при S=1, UI=1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { useFieldSize } from "../lounge/useFieldSize";
import { gorbovSequence } from "./gorbov";
import {
  fmtS,
  getExBest,
  gorbovNorm,
  loadExSize,
  saveExBest,
  saveExSize,
  schulteNorm,
  starsFor,
} from "./tableEx";
import "./exShell.css";

export type TableExResult = {
  mode: "schulte" | "gorbov";
  wpm: number;
  words: number;
  elapsed: number;
  score: number;
};

type CellLabel = { label: string; color: "text" | "red" };
type SymKey = "num" | "ru" | "uk" | "en" | "de";

const ALPHABETS: Record<Exclude<SymKey, "num">, string> = {
  ru: "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ",
  uk: "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЮЯ",
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  de: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ",
};

const SYM_BTNS: { key: SymKey; label: string }[] = [
  { key: "num", label: "1–N" },
  { key: "ru", label: "А–Я" },
  { key: "uk", label: "А–Ї" },
  { key: "en", label: "A–Z" },
  { key: "de", label: "A–Ü" },
];

type Props = {
  gorbov: boolean;
  onExit: () => void;
  onResult: (payload: TableExResult) => void;
};

function buildOrder(n: number, gorbov: boolean, symbols: SymKey): CellLabel[] {
  const cells = n * n;
  if (gorbov) {
    return gorbovSequence(n).map(({ color, value }) => ({
      label: String(value),
      color: color === "r" ? "red" : "text",
    }));
  }
  if (symbols !== "num") {
    const abc = ALPHABETS[symbols];
    if (cells <= abc.length) {
      return Array.from({ length: cells }, (_, i) => ({ label: abc[i]!, color: "text" as const }));
    }
  }
  return Array.from({ length: cells }, (_, i) => ({ label: String(i + 1), color: "text" as const }));
}

function shuffleIndices(len: number): number[] {
  const a = Array.from({ length: len }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function loadSym(): SymKey {
  try {
    const k = localStorage.getItem("st_shl_sym") || "num";
    if (k === "ru" || k === "uk" || k === "en" || k === "de" || k === "num") return k;
  } catch {
    /* ignore */
  }
  return "num";
}

export default function TableExView({ gorbov, onExit, onResult }: Props) {
  const code = gorbov ? "E-GRB" : "E-SHL";
  const sizes = gorbov ? [5, 7] : [3, 4, 5, 6, 7];
  const sizeKey = gorbov ? "grb_n" : "shl_n";

  const [n, setN] = useState(() => loadExSize(sizeKey, 5));
  const [symbols, setSymbols] = useState<SymKey>(() => (gorbov ? "num" : loadSym()));
  const [order, setOrder] = useState<CellLabel[]>(() => buildOrder(5, gorbov, "num"));
  const [cells, setCells] = useState<number[]>(() => shuffleIndices(25));
  const [found, setFound] = useState(0);
  const [errors, setErrors] = useState(0);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<{ pos: number; kind: "ok" | "err" } | null>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState<number | null>(() => getExBest(code, `${n}x${n}`));
  const [finishBanner, setFinishBanner] = useState("");

  const boardRef = useRef<HTMLDivElement>(null);
  const field = useFieldSize(boardRef, 80);
  /* desktop _geom: size = min(w,h) - px(30); cell = size/n; fs = max(10, cell/S*0.36) */
  const boardSize = Math.max(60, Math.min(field.w, field.h) - 30);
  const cellPx = boardSize / n;
  const cellFs = Math.max(10, Math.floor(cellPx * 0.36));

  const t0 = useRef<number | null>(null);
  const tEnd = useRef<number | null>(null);
  const foundRef = useRef(0);
  const errorsRef = useRef(0);
  const doneRef = useRef(false);

  const norm = useMemo(() => (gorbov ? gorbovNorm(n) : schulteNorm(n)), [gorbov, n]);

  const variantKey = (size: number, sym: SymKey) =>
    `${size}x${size}${gorbov || sym === "num" ? "" : `-${sym}`}`;

  const elapsed = useCallback(() => {
    if (t0.current == null) return 0;
    const end = doneRef.current && tEnd.current != null ? tEnd.current : performance.now();
    return (end - t0.current) / 1000 + errorsRef.current * 2;
  }, []);

  const newGame = useCallback(
    (size = n, sym = symbols) => {
      const ord = buildOrder(size, gorbov, gorbov ? "num" : sym);
      setOrder(ord);
      setCells(shuffleIndices(ord.length));
      setFound(0);
      setErrors(0);
      setDone(false);
      setFlash(null);
      setFinishBanner("");
      t0.current = null;
      tEnd.current = null;
      foundRef.current = 0;
      errorsRef.current = 0;
      doneRef.current = false;
      setRunning(false);
      setBest(getExBest(code, variantKey(size, sym)));
      setTick((x) => x + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, symbols, gorbov, code],
  );

  useEffect(() => {
    const size = loadExSize(sizeKey, 5);
    const sym = gorbov ? "num" : loadSym();
    setN(size);
    setSymbols(sym);
    newGame(size, sym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorbov]);

  useEffect(() => {
    if (!running || done) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 100);
    return () => window.clearInterval(id);
  }, [running, done]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
        e.preventDefault();
        newGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, newGame]);

  const setSize = (size: number) => {
    setN(size);
    saveExSize(sizeKey, size);
    newGame(size, symbols);
  };

  const setSym = (key: SymKey) => {
    setSymbols(key);
    localStorage.setItem("st_shl_sym", key);
    newGame(n, key);
  };

  const onCell = (pos: number) => {
    if (doneRef.current) return;
    const idx = cells[pos];
    if (idx == null) return;
    if (t0.current == null) {
      t0.current = performance.now();
      setRunning(true);
    }
    if (idx === foundRef.current) {
      const next = foundRef.current + 1;
      foundRef.current = next;
      setFound(next);
      setFlash({ pos, kind: "ok" });
      if (next >= order.length) {
        doneRef.current = true;
        tEnd.current = performance.now();
        setDone(true);
        const el = Math.round(elapsed() * 10) / 10;
        const stars = starsFor(el, norm);
        const isRecord = saveExBest(code, variantKey(n, symbols), el);
        if (isRecord) setBest(el);
        setFinishBanner(
          `${isRecord ? `${t("ex_new_record")} ` : ""}${"★".repeat(stars)}${"☆".repeat(3 - stars)}`,
        );
        onResult({
          mode: gorbov ? "gorbov" : "schulte",
          wpm: 0,
          words: order.length,
          elapsed: el,
          score: el,
        });
      }
    } else if (idx > foundRef.current) {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFlash({ pos, kind: "err" });
    }
  };

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 180);
    return () => window.clearTimeout(id);
  }, [flash]);

  const total = order.length;
  const cur = found < total ? order[found] : null;
  const nxtLabel = found + 1 < total ? order[found + 1]!.label : "—";
  const el = elapsed();
  const tempo = found > 0 ? el / found : 0;
  void tick;

  const title = gorbov
    ? t("ex_title_gorbov").replace("{0}", String(n)).replace("{1}", String(n))
    : t("ex_title_schulte").replace("{0}", String(n)).replace("{1}", String(n));

  const recText =
    finishBanner ||
    (best != null
      ? t("ex_record").replace("{0}", String(n)).replace("{1}", String(n)).replace("{2}", fmtS(best))
      : t("ex_no_record"));

  /* desktop: red dot rr = px(5) → diameter 10 */
  const dotR = 5;

  return (
    <div className="ex-shell" data-nav-lock>
      <header className="ex-head">
        <span className="ex-head-bar" aria-hidden />
        <div className="ex-head-text">
          <h2 className="ex-title">{title}</h2>
          <p className="ex-sub">{t("ex_hint")}</p>
        </div>
        <button type="button" className="hud-btn ex-back-btn" onClick={onExit}>
          {t("ex_back")}
        </button>
      </header>

      <div className="ex-body">
        <aside className="ex-col ex-left">
          <section className="inst-panel ex-panel ex-find">
            <div className="lab">{t("ex_find")}</div>
            <div
              className="ex-target"
              style={{
                color: !cur
                  ? "var(--st-ok)"
                  : cur.color === "red"
                    ? "var(--st-error)"
                    : "var(--st-accent)",
              }}
            >
              {cur ? cur.label : "✓"}
            </div>
            <p className="ex-next">
              {cur ? t("ex_next").replace("{0}", nxtLabel) : t("ex_done")}
            </p>
            <p className="ex-found">
              {t("ex_found").replace("{0}", String(found)).replace("{1}", String(total))}
            </p>
          </section>

          <section className="inst-panel ex-panel ex-mode">
            <div className="lab">{t("ex_mode")}</div>
            <p className="ex-mini-lab">{t("ex_size")}</p>
            <div className="ex-chip-row" data-nav-group="ex-size">
              {sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`hud-btn ex-chip ${n === sz ? "amber" : ""}`}
                  onClick={() => setSize(sz)}
                >
                  {sz}×{sz}
                </button>
              ))}
            </div>
            {!gorbov && (
              <>
                <p className="ex-mini-lab">{t("ex_symbols")}</p>
                <div className="ex-chip-row" data-nav-group="ex-sym">
                  {SYM_BTNS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      className={`hud-btn ex-chip ${symbols === b.key ? "amber" : ""}`}
                      onClick={() => setSym(b.key)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="ex-mode-hint">{gorbov ? t("ex_gorbov_hint") : t("ex_schulte_hint")}</p>
          </section>
        </aside>

        {/* desktop: Canvas sticky=nsew, bg=BG2, padx=12 */}
        <div className="ex-board" ref={boardRef}>
          <div
            className="ex-board-stage"
            style={{ width: boardSize, height: boardSize }}
          >
            <div
              className="ex-grid"
              style={{
                gridTemplateColumns: `repeat(${n}, 1fr)`,
                fontSize: cellFs,
              }}
              role="grid"
              aria-label={title}
            >
              {cells.map((ordIdx, pos) => {
                const cell = order[ordIdx]!;
                const isDone = ordIdx < found;
                const flashHere = flash?.pos === pos ? flash.kind : null;
                return (
                  <button
                    key={`${pos}-${cell.label}-${cell.color}`}
                    type="button"
                    className={`ex-cell${isDone ? " done" : ""}${flashHere === "ok" ? " flash-ok" : ""}${flashHere === "err" ? " flash-err" : ""}`}
                    style={{ color: cell.color === "red" ? "var(--st-error)" : "var(--st-text)" }}
                    onClick={() => onCell(pos)}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>
            <span
              className="ex-dot"
              aria-hidden
              style={{ width: dotR * 2, height: dotR * 2, margin: `-${dotR}px 0 0 -${dotR}px` }}
            />
          </div>
        </div>

        <aside className="ex-col ex-right">
          <section className="inst-panel ex-panel ex-timer">
            <div className="lab">{t("ex_timer")}</div>
            <div className="ex-clock">{fmtS(el)}</div>
            <p className={`ex-rec${finishBanner ? " amber" : ""}`}>{recText}</p>
          </section>

          <section className="inst-panel ex-panel ex-tele">
            <div className="lab">{t("ex_telemetry")}</div>
            <pre className="ex-tele-body">
              {`${t("ex_errors").padEnd(14)}${errors}
${t("ex_tempo").padEnd(14)}${tempo.toFixed(2)}
${t("ex_norm3").padEnd(14)}≤ ${Math.round(norm[0])} С
${t("ex_norm2").padEnd(14)}≤ ${Math.round(norm[1])} С
${t("ex_norm1").padEnd(14)}≤ ${Math.round(norm[2])} С`}
            </pre>
          </section>

          <button type="button" className="hud-btn amber ex-restart" onClick={() => newGame()}>
            {t("ex_restart")}
          </button>
        </aside>
      </div>
    </div>
  );
}
