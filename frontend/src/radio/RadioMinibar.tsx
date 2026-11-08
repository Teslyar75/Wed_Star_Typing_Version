/** Компактная полоса приёмника в шапке — как stamina/radio/minibark.RadioMiniBar.
 *  За «⠿» её можно вынуть из шапки и поставить в любое место окна (position:fixed,
 *  позиция — доли окна, хранится в localStorage); двойной щелчок по «⠿» — обратно в шапку. */
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import { fromFrac, loadPos, savePos, toFrac, type Pos } from "./radioPos";
import { useRadio } from "./radioStore";

type Props = { onOpen: () => void };

function shortName(name: string, max = 16): string {
  const n = name.trim();
  if (n.length <= max) return n;
  return `${n.slice(0, max - 1)}…`;
}

export default function RadioMinibar({ onOpen }: Props) {
  const { station, playing, toggle, volume, setVolume, stop } = useRadio();
  const [pos, setPos] = useState<Pos | null>(() => loadPos());
  const [, setTick] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ sx: number; sy: number; x0: number; y0: number; moved: boolean } | null>(null);

  // окно браузера изменилось — плашка остаётся в видимой части
  useEffect(() => {
    if (!pos) return;
    const on = () => setTick((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [pos]);

  const onDown = useCallback((e: RPE<HTMLSpanElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { sx: e.clientX, sy: e.clientY, x0: r.left, y0: r.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, []);
  const onMove = useCallback((e: RPE<HTMLSpanElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    setPos(toFrac(d.x0 + dx, d.y0 + dy, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight));
  }, []);
  const onUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) setPos((p) => (savePos(p), p));
  }, []);
  const reset = useCallback(() => {
    savePos(null);
    setPos(null);
  }, []);

  if (!station) return null;
  const volPct = Math.round(volume * 100);
  const el = ref.current;
  const style = pos
    ? (() => {
        const w = el?.offsetWidth ?? 220;
        const h = el?.offsetHeight ?? 28;
        const { x, y } = fromFrac(pos, w, h, window.innerWidth, window.innerHeight);
        return { position: "fixed" as const, left: x, top: y, zIndex: 900 };
      })()
    : undefined;

  const bar = (
    <div ref={ref} className={`radio-minibar${pos ? " radio-minibar--floating" : ""}`} title={station.name} style={style}>
      <span
        className="radio-mini-grip"
        title={t("radio_drag")}
        aria-label={t("radio_drag")}
        role="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={reset}
      >
        ⠿
      </span>
      <button type="button" className="hud-btn radio-mini-name" onClick={onOpen}>
        {shortName(station.name)}
        <span className="radio-mini-vol"> · {volPct}</span>
      </button>
      <button type="button" className="hud-btn amber radio-mini-btn" onClick={() => toggle()} title={playing ? t("pause") : t("start")}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        className="hud-btn radio-mini-btn"
        onClick={() => setVolume(Math.max(0, volume - 0.08))}
        title={t("radio_vol")}
      >
        −
      </button>
      <button
        type="button"
        className="hud-btn radio-mini-btn"
        onClick={() => setVolume(Math.min(1, volume + 0.08))}
        title={t("radio_vol")}
      >
        +
      </button>
      <button type="button" className="hud-btn danger radio-mini-btn" onClick={() => stop()} title={t("stop")}>
        ✕
      </button>
    </div>
  );
  // плавающая — в body: position:fixed от окна, а не от шапки (transform/overflow предков)
  return pos ? createPortal(bar, document.body) : bar;
}
