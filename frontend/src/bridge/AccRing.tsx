/** Порт stamina/hud.RingGauge — кольцо точности с делениями. */

type Props = {
  value: number | null;
  sub?: string;
  title?: string;
};

function ringColor(v: number): string {
  if (v >= 96) return "var(--st-ok)";
  if (v >= 90) return "var(--st-accent)";
  return "var(--st-error)";
}

export default function AccRing({ value, sub = "", title = "ТОЧНОСТЬ" }: Props) {
  const W = 200;
  const H = 168;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const r = Math.min(W / 2 - 12, H / 2 - 12);
  const tr = r * 0.9;
  const circ = 2 * Math.PI * tr;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  const col = value == null ? "var(--st-muted)" : ringColor(value);
  const label = value == null ? "—" : `${value.toFixed(1)}%`;

  const ticks = [];
  for (let i = 0; i < 40; i++) {
    const a = ((90 - i * 9) * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = r * 1.04;
    const r2 = r * (major ? 1.12 : 1.08);
    ticks.push(
      <line
        key={i}
        x1={cx + r1 * Math.cos(a)}
        y1={cy - r1 * Math.sin(a)}
        x2={cx + r2 * Math.cos(a)}
        y2={cy - r2 * Math.sin(a)}
        stroke="var(--st-faint, #2b4762)"
        strokeWidth={major ? 1.4 : 1}
      />,
    );
  }

  // Arc starts at 12 o'clock, sweeps clockwise (SVG: rotate -90, positive dash)
  const dash = frac * circ * 0.999;
  const gap = circ - dash;

  return (
    <div className="acc-ring">
      <div className="acc-ring-title">{title}</div>
      <svg className="acc-ring-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {ticks}
        <circle
          cx={cx}
          cy={cy}
          r={tr}
          fill="none"
          stroke="color-mix(in srgb, var(--st-cyan) 35%, #061018)"
          strokeWidth={9}
        />
        {frac > 0 && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={tr}
              fill="none"
              stroke={col}
              strokeWidth={13}
              strokeOpacity={0.35}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            <circle
              cx={cx}
              cy={cy}
              r={tr}
              fill="none"
              stroke={col}
              strokeWidth={5}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          </>
        )}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className={`acc-ring-value ${value == null ? "dim" : ""}`}
          fill={col}
        >
          {label}
        </text>
        {sub ? (
          <text
            x={cx}
            y={cy + r * 0.42}
            textAnchor="middle"
            dominantBaseline="middle"
            className="acc-ring-sub"
            fill={value != null && value < 90 ? "var(--st-error)" : "var(--st-muted)"}
          >
            {sub}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
