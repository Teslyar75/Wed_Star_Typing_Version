/** Компактная плашка совпадения % — всегда в видимой зоне канала. */
import { t } from "../i18n";

type Props = {
  score: number | null;
  heard?: string;
  selfScore?: boolean;
  missed?: string[];
  counted?: number;
  total?: number;
  /** interim: показать услышанное до финального score */
  listening?: boolean;
};

export default function MatchReadout({
  score,
  heard,
  selfScore,
  missed,
  counted,
  total,
  listening,
}: Props) {
  if (score == null && !selfScore && !listening && !heard) return null;
  // никогда не подставляем 90% — только реальный score (0 при тишине/промахе)
  const pct = score == null ? null : Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const verdict =
    pct == null
      ? t("en_listening")
      : pct >= 85
        ? t("en_match_great")
        : pct >= 60
          ? t("en_match_ok")
          : t("en_match_again");
  const tone = pct == null ? "amber" : pct >= 85 ? "ok" : pct >= 60 ? "amber" : "danger";
  const segs = 16;
  const filled = pct == null ? 0 : Math.round((pct / 100) * segs);

  return (
    <div className={`en-match tone-${tone}${listening ? " live" : ""}`}>
      <div className="en-match-head">
        <span className="en-match-lab">{selfScore ? t("en_self_score") : t("en_match")}</span>
        {pct != null ? <strong className="en-match-pct">{pct}%</strong> : <strong className="en-match-pct">…</strong>}
        <span className="en-match-verdict">{verdict}</span>
      </div>
      <div className="en-match-bar" aria-hidden>
        {Array.from({ length: segs }, (_, i) => (
          <span key={i} className={i < filled ? "on" : ""} />
        ))}
      </div>
      {(counted != null || heard || missed?.length) && (
        <p className="muted en-match-meta">
          {counted != null && total != null
            ? t("en_match_words")
                .replace("{0}", String(counted))
                .replace("{1}", String(total))
            : null}
          {missed?.length ? ` · ${t("en_match_missed")}: ${missed.join(", ")}` : null}
          {heard ? ` · ${t("en_heard")}: «${heard}»` : null}
        </p>
      )}
    </div>
  );
}
