/**
 * E-PYR Пирамида — паритет stamina/speedread/exercises.py PyramidEx.
 * Разметка: canvas fill; красная ось; font 16 mono; метки «N зн.» слева; кнопка h=34.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang, t } from "../i18n";
import { useFieldSize } from "../lounge/useFieldSize";
import { buildPyramidRows, pyrFieldWidth, PYR_NORM, type PyrRow } from "./epyr";
import { getExBest, saveExBest, starsFor } from "./tableEx";
import "./exShell.css";
import "./exTrainers.css";

export type PyramidResult = {
  mode: "epyr";
  wpm: number;
  words: number;
  elapsed: number;
  score: number;
};

type Props = {
  onExit: () => void;
  onResult: (payload: PyramidResult) => void;
};

const FONT_PX = 16;
const PAD_TOP = 15;
const PAD_V = 30;
const LINE_TOP = 10;
const LINE_BOT = 10;
const LABEL_X = 20;

export default function PyramidExView({ onExit, onResult }: Props) {
  const [rows, setRows] = useState<PyrRow[]>(() => buildPyramidRows(getLang()));
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState("");
  const [best, setBest] = useState<number | null>(() => getExBest("E-PYR", "default"));
  const canvasRef = useRef<HTMLDivElement>(null);
  const field = useFieldSize(canvasRef, 80);
  const cwRef = useRef(10);

  /* ширина «0» как tkfont.Font.measure("0") */
  useEffect(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.font = `bold ${FONT_PX}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    cwRef.current = ctx.measureText("0").width || 10;
  }, []);

  const renew = useCallback(() => {
    setRows(buildPyramidRows(getLang()));
    setChosen(null);
    setResult("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
        e.preventDefault();
        renew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, renew]);

  const onClickRow = (i: number) => {
    const row = rows[i];
    if (!row) return;
    setChosen(i);
    const width = pyrFieldWidth(row);
    const stars = starsFor(width, PYR_NORM, false);
    const isRecord = saveExBest("E-PYR", "default", width, false);
    if (isRecord) setBest(width);
    const starsStr = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
    setResult(
      `${t("ex_pyr_result").replace("{0}", String(width))}  ${starsStr}` +
        (isRecord ? `  ${t("ex_new_record")}` : ""),
    );
    onResult({
      mode: "epyr",
      wpm: 0,
      words: width,
      elapsed: 0,
      score: width,
    });
  };

  const h = Math.max(field.h, 120);
  const w = Math.max(field.w, 120);
  const rh = (h - PAD_V) / rows.length;
  const cx = w / 2;
  const cw = cwRef.current;

  return (
    <div className="ex-shell ex-pyr" data-nav-lock>
      <header className="ex-head">
        <span className="ex-head-bar" aria-hidden />
        <div className="ex-head-text">
          <h2 className="ex-title">{t("ex_title_pyr")}</h2>
          <p className="ex-sub">{t("ex_pyr_hint")}</p>
        </div>
        <button type="button" className="hud-btn ex-back-btn" onClick={onExit}>
          {t("ex_back")}
        </button>
      </header>

      <div className="ex-pyr-body">
        <div className="ex-pyr-canvas" ref={canvasRef} role="list" aria-label={t("ex_title_pyr")}>
          <div
            className="ex-pyr-axis"
            style={{ top: LINE_TOP, bottom: LINE_BOT, left: cx }}
            aria-hidden
          />
          {rows.map((row, i) => {
            const y = PAD_TOP + rh * (i + 0.5);
            const half = (row.width * cw) / 2;
            const active = chosen === i;
            const fieldW = pyrFieldWidth(row);
            return (
              <button
                key={`${i}-${row.a}-${row.b}`}
                type="button"
                className={`ex-pyr-row${active ? " on" : ""}`}
                style={{ top: y }}
                role="listitem"
                onClick={() => onClickRow(i)}
              >
                <span className="ex-pyr-width" style={{ left: LABEL_X }}>
                  {t("ex_pyr_zn").replace("{0}", String(fieldW).padStart(2, " "))}
                </span>
                <span className="ex-pyr-a" style={{ right: `calc(50% + ${half}px)` }}>
                  {row.a}
                </span>
                <span className="ex-pyr-b" style={{ left: `calc(50% + ${half}px)` }}>
                  {row.b}
                </span>
              </button>
            );
          })}
        </div>

        <p className="ex-pyr-result">
          {result ||
            (best != null
              ? t("ex_pyr_best").replace("{0}", String(best))
              : "")}
        </p>
        <button type="button" className="hud-btn amber ex-pyr-new" onClick={renew}>
          {t("ex_pyr_new")}
        </button>
      </div>
    </div>
  );
}
