/** Порт stamina/hud.SpeedGauge — полукруглый спидометр зн/мин. */

type Props = {
  value: number;
  avg?: number;
  wpm?: number;
  vmax?: number;
  title?: string;
  unit?: string;
};

const START = 215;
const SWEEP = 250;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function angleFor(v: number, vmax: number) {
  const frac = Math.max(0, Math.min(1, v / vmax));
  return START - SWEEP * frac;
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a0 - a1) > 180 ? 1 : 0;
  // sweep flag 0 = clockwise in SVG when y grows down... we use screen y-down; sin flip in polar
  const sweep = a1 < a0 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`;
}

export default function SpeedGauge({
  value,
  avg,
  wpm,
  vmax = 400,
  title = "СКОРОСТЬ",
  unit = "ЗН/МИН",
}: Props) {
  const W = 200;
  const H = 168;
  const cx = W / 2;
  const cy = H / 2 + 10;
  const r = Math.min(W / 2 - 10, H / 2 - 6);
  const tr = r * 0.8;
  const shown = Math.max(0, value);
  const vmaxUse = Math.max(shown, avg ?? 0) >= 380 ? 600 : vmax;
  const tip = polar(cx, cy, r * 0.74, angleFor(shown, vmaxUse));
  const ticks = [];
  for (let v = 0; v <= vmaxUse; v += 20) {
    const a = angleFor(v, vmaxUse);
    const major = v % 100 === 0;
    const p1 = polar(cx, cy, r * (major ? 0.86 : 0.89), a);
    const p2 = polar(cx, cy, r * 0.95, a);
    ticks.push(
      <line
        key={v}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={major ? "var(--st-muted)" : "var(--st-faint, #2b4762)"}
        strokeWidth={major ? 2 : 1}
      />,
    );
    if (major) {
      const lab = polar(cx, cy, r * 0.64, a);
      ticks.push(
        <text key={`l${v}`} x={lab.x} y={lab.y} textAnchor="middle" dominantBaseline="middle" className="sg-tick">
          {v}
        </text>,
      );
    }
  }

  const frac = Math.max(0, Math.min(1, shown / vmaxUse));
  const aEnd = angleFor(shown, vmaxUse);

  return (
    <div className="speed-gauge">
      <div className="sg-head">
        <span className="sg-title">{title}</span>
        {(avg != null || wpm != null) && (
          <span className="sg-sub">
            СРЕДН. {Math.round(avg ?? shown)}
            {wpm != null ? ` · ≈${wpm} WPM` : ""}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sg-svg" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="color-mix(in srgb, var(--st-bg) 80%, #000)" stroke="var(--st-line)" />
        <circle cx={cx} cy={cy} r={r * 0.93} fill="none" stroke="color-mix(in srgb, var(--st-line) 50%, transparent)" />
        <path
          d={arcPath(cx, cy, tr, START - SWEEP, START)}
          fill="none"
          stroke="color-mix(in srgb, var(--st-cyan) 35%, #000)"
          strokeWidth={9}
          strokeLinecap="butt"
        />
        {ticks}
        {frac > 0.002 && (
          <path
            d={arcPath(cx, cy, tr, START, aEnd)}
            fill="none"
            stroke="var(--st-cyan)"
            strokeWidth={5}
            strokeLinecap="butt"
          />
        )}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="color-mix(in srgb, var(--st-accent) 50%, #000)" strokeWidth={6} />
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="var(--st-accent)" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={7} fill="color-mix(in srgb, var(--st-accent) 40%, #000)" stroke="var(--st-accent)" />
        <text x={cx} y={cy + r * 0.4} textAnchor="middle" className="sg-value">
          {Math.round(shown)}
        </text>
        <text x={cx} y={cy + r * 0.66} textAnchor="middle" className="sg-unit">
          {unit}
        </text>
      </svg>
    </div>
  );
}
