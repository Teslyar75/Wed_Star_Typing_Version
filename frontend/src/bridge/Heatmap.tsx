import { FINGER_COLORS, HOME_BUMPS, MOD_FINGER, ROWS } from "../typing/layouts";
import { t } from "../i18n";

export type KeyRate = { key: string; rate: number; errors: number; hits: number };

function colorFor(rate: number | undefined): string {
  if (rate == null || rate <= 0) return "transparent";
  if (rate < 0.05) return "color-mix(in srgb, #3d9a5f 55%, transparent)";
  if (rate < 0.12) return "color-mix(in srgb, #c9a227 50%, transparent)";
  return "color-mix(in srgb, #c94c4c 60%, transparent)";
}

type Props = { rates: KeyRate[]; lang: string; showTitle?: boolean; showPct?: boolean };

export default function Heatmap({ rates, lang, showTitle = true, showPct = false }: Props) {
  const map = new Map(rates.map((r) => [r.key.toLowerCase(), r]));
  const isRu = lang.startsWith("ru") || lang === "uk";
  return (
    <div className={`heatmap ${showPct ? "with-pct" : ""}`}>
      {showTitle ? <h3>{t("heatmap")}</h3> : null}
      <div className={`keyboard lang-${isRu ? "ru" : "en"}`} aria-label={t("heatmap")}>
        {ROWS.map((row, ri) => (
          <div className="kb-row" key={ri}>
            {row.map(([id, en, ru, w, finger]) => {
              const label = (isRu ? ru || en : en || ru).toLowerCase();
              const stat = map.get(label) || map.get(id.replace("Key", "").toLowerCase());
              const pct = stat && stat.rate > 0 ? `${Math.round(stat.rate * 1000) / 10}` : "";
              const isMod = finger === MOD_FINGER;
              return (
                <div
                  key={id}
                  className={`key ${isMod ? "mod" : ""}`}
                  title={stat ? `${stat.errors}/${stat.hits + stat.errors}` : undefined}
                  style={{
                    flex: `${w} 1 0`,
                    minWidth: 0,
                    borderColor: FINGER_COLORS[finger],
                    background: colorFor(stat?.rate),
                  }}
                >
                  <span className="key-en">{en || "␣"}</span>
                  {ru && ru !== en ? <span className="key-ru">{ru}</span> : null}
                  {HOME_BUMPS.has(id) ? <span className="key-home" aria-hidden /> : null}
                  {showPct && pct ? <em className="key-pct">{pct}</em> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
