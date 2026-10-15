/**
 * Фон «Старая Англия»: Биг-Бен в тумане, газовые фонари, редкий силуэт Routemaster.
 * Лёгкий: DOM + CSS-анимации (без canvas). Туман редеет при серии верных нажатий (событие st-type).
 */
import { useEffect, useState } from "react";
import "./londonFog.css";

const LAMPS = [8, 27, 49, 71, 90];

function Bus() {
  return (
    <svg viewBox="0 0 220 120" width="220" height="120" aria-hidden>
      <g fill="#5a0f18" stroke="#1a0a0c" strokeWidth="2">
        <path d="M14 18 Q14 6 30 6 H196 Q210 6 210 20 V98 H14 Z" />
      </g>
      <g fill="#f3d58a" opacity="0.75">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={`u${i}`} x={30 + i * 28} y={16} width={20} height={20} rx={3} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={`l${i}`} x={44 + i * 30} y={54} width={22} height={22} rx={3} />
        ))}
      </g>
      <rect x="16" y="50" width="22" height="44" fill="#2a0a0f" />
      <rect x="14" y="44" width="196" height="4" fill="#d4af37" opacity="0.6" />
      <g fill="#111">
        <circle cx="52" cy="100" r="12" />
        <circle cx="176" cy="100" r="12" />
      </g>
    </svg>
  );
}

export default function LondonFog() {
  const [clear, setClear] = useState(0);
  const [bus, setBus] = useState(0);

  useEffect(() => {
    const onType = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; streak: number }>).detail;
      if (!d) return;
      setClear(!d.ok ? 0 : d.streak >= 40 ? 2 : d.streak >= 12 ? 1 : 0);
    };
    window.addEventListener("st-type", onType);
    return () => window.removeEventListener("st-type", onType);
  }, []);

  useEffect(() => {
    let t = 0;
    let hide = 0;
    const schedule = (first = false) => {
      const ms = first ? 8000 + Math.random() * 12000 : 40000 + Math.random() * 50000;
      t = window.setTimeout(() => {
        setBus((b) => b + 1);
        hide = window.setTimeout(() => schedule(), 16000);
      }, ms);
    };
    schedule(true);
    const now = () => setBus((b) => b + 1);
    window.addEventListener("st-lf-bus", now);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(hide);
      window.removeEventListener("st-lf-bus", now);
    };
  }, []);

  return (
    <div className="lf" data-clear={clear} aria-hidden>
      <div className="lf-img" />
      <div className="lf-lamps">
        {LAMPS.map((x, i) => (
          <span key={x} className="lf-lamp" style={{ left: `${x}%`, animationDelay: `${i * 1.3}s` }} />
        ))}
      </div>
      {bus > 0 && (
        <div className="lf-bus" key={bus} data-dir={bus % 2 ? "r" : "l"}>
          <Bus />
        </div>
      )}
      <div className="lf-fog lf-fog1" />
      <div className="lf-fog lf-fog2" />
      <div className="lf-fog lf-fog3" />
      <div className="lf-vignette" />
    </div>
  );
}
