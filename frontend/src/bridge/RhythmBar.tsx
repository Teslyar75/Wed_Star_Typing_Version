/** Ритм печати — ряд сегментов (как на десктопе под спидометром). */

type Props = { value: number | null; cells?: number };

export default function RhythmBar({ value, cells = 12 }: Props) {
  const lit = value == null ? 0 : Math.round((Math.max(0, Math.min(100, value)) / 100) * cells);
  return (
    <div className="rhythm-strip">
      <span className="lab">РИТМ ПЕЧАТИ{value != null ? ` ${Math.round(value)}%` : ""}</span>
      <div className="rhythm-cells" aria-hidden>
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className={`rhythm-cell ${i < lit ? "on" : ""}`} />
        ))}
      </div>
    </div>
  );
}
