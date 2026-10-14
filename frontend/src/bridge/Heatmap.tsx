import type { CSSProperties } from "react";
import { FINGER_COLORS, HOME_BUMPS, MOD_FINGER, ROWS } from "../typing/layouts";
import { t } from "../i18n";
import { colorFor, heatFillMix } from "./heatmapColor";

export type KeyRate = { key: string; rate: number; errors: number; hits: number };

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
              const rate = stat?.rate;
              const heat = colorFor(rate);
              const pct = rate != null && rate > 0 ? `${Math.round(rate * 1000) / 10}` : "";
              const isMod = finger === MOD_FINGER;
              const style: CSSProperties & Record<string, string | number> = {
                flex: `${w} 1 0`,
                minWidth: 0,
              };
              if (heat && rate != null) {
                const mix = heatFillMix(rate);
                style["--st-frame-fill"] = `color-mix(in srgb, ${heat} ${mix}%, transparent)`;
                style["--st-frame-glow"] = heat;
                style["--st-frame-line"] = `color-mix(in srgb, ${heat} 78%, var(--st-line))`;
              } else {
                style.borderColor = FINGER_COLORS[finger];
              }
              return (
                <div
                  key={id}
                  className={`key ${isMod ? "mod" : ""}${heat ? " heat" : ""}`}
                  title={stat ? `${stat.errors}/${stat.hits + stat.errors}` : undefined}
                  style={style}
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
