import { FINGER_COLORS, ROWS } from "../typing/layouts";
import { t } from "../i18n";

export type KeyRate = { key: string; rate: number; errors: number; hits: number };

function colorFor(rate: number | undefined): string {
  if (rate == null || rate <= 0) return "transparent";
  if (rate < 0.05) return "color-mix(in srgb, #3d9a5f 55%, transparent)";
  if (rate < 0.12) return "color-mix(in srgb, #c9a227 50%, transparent)";
  return "color-mix(in srgb, #c94c4c 60%, transparent)";
}

type Props = { rates: KeyRate[]; lang: string };

export default function Heatmap({ rates, lang }: Props) {
  const map = new Map(rates.map((r) => [r.key.toLowerCase(), r]));
  return (
    <div className="heatmap">
      <h3>{t("heatmap")}</h3>
      <div className="keyboard" aria-label={t("heatmap")}>
        {ROWS.map((row, ri) => (
          <div className="kb-row" key={ri}>
            {row.map(([id, en, ru, w, finger]) => {
              const label = (lang === "ru" ? ru || en : en || ru).toLowerCase();
              const stat = map.get(label) || map.get(id.replace("Key", "").toLowerCase());
              return (
                <div
                  key={id}
                  className="key"
                  title={stat ? `${stat.errors}/${stat.hits + stat.errors}` : undefined}
                  style={{
                    flex: w,
                    borderColor: FINGER_COLORS[finger],
                    background: colorFor(stat?.rate),
                  }}
                >
                  <span>{lang === "ru" ? ru || en : en || ru}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
