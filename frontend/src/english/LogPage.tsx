/**
 * ЖУРНАЛ — порт stamina/english/pages_misc.LogPage.
 * Десктоп не влезает в один экран (скролл) → на вебе две вкладки без скролла:
 *   ПРОГРЕСС (телеметрия / наборы / точность / теплокарта)
 *   ЗНАКИ · ОШИБКИ
 */
import { useEffect, useState } from "react";
import { t } from "../i18n";

type ModeAcc = { ok: number; n: number; pct: number | null };
type Journal = {
  xp: number;
  rank: string;
  st_rank?: string;
  level?: number;
  level_lo?: number;
  level_hi?: number;
  streak_days?: number;
  best_streak?: number;
  learned?: number;
  due?: number;
  xp_today?: number;
  daily_goal?: number;
  weeks?: number[];
  heat?: { date: string; xp: number; today?: boolean }[];
  accuracy?: {
    overall: number | null;
    total: number;
    modes: Record<string, ModeAcc>;
  };
  sets?: { id: string; code?: string; name: string; known: number; total: number }[];
  mistakes?: { word_id: number; word: string; grade: number }[];
  badges?: { id: string; title: string; desc?: string; bonus?: number; ok: boolean; date?: string | null }[];
};

type Props = {
  onReviewMistakes: () => void;
  onMissionMistakes: () => void;
  onOpenWord: (word: string) => void;
};

type LogTab = "progress" | "marks";

const MODE_KEYS: { id: string; label: string }[] = [
  { id: "reading", label: "en_mode_reading" },
  { id: "questions", label: "en_mode_questions" },
  { id: "speaking", label: "en_mode_speaking" },
  { id: "review", label: "en_mode_cards" },
];

const HEAT_DAY_LABS = ["ПН", "", "СР", "", "ПТ", "", "ВС"];
const SEGMENTS = 16;

function SegmentBar({
  label,
  value,
  total,
  tone = "cyan",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "cyan" | "amber" | "ok";
}) {
  const frac = Math.max(0, Math.min(1, value / Math.max(1, total)));
  const filled = Math.round(frac * SEGMENTS);
  return (
    <div className={`en-segbar tone-${tone}`}>
      <div className="en-segbar-head">
        <span>{label}</span>
        <span className="mono muted">
          {value} / {total}
        </span>
      </div>
      <div className="en-segbar-track" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={i < filled ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

function RingGauge({ pct, answers }: { pct: number | null; answers: number }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const deg = (p / 100) * 360;
  const style =
    pct == null
      ? { background: "color-mix(in srgb, var(--st-line) 55%, transparent)" }
      : {
          background: `conic-gradient(#ff4d6d 0deg ${deg}deg, color-mix(in srgb, var(--st-cyan) 35%, #061018) ${deg}deg 360deg)`,
        };
  return (
    <div className="en-log-ring-wrap">
      <div className="en-log-ring" style={style} aria-label={t("en_acc_overall")}>
        <div className="en-log-ring-inner">
          <strong>{pct != null ? `${pct}%` : "—"}</strong>
          <span>{t("en_acc_overall")}</span>
          <span className="muted">{t("en_acc_answers").replace("{0}", String(answers))}</span>
        </div>
      </div>
    </div>
  );
}

export default function LogPage({ onReviewMistakes, onMissionMistakes, onOpenWord }: Props) {
  const [j, setJ] = useState<Journal | null>(null);
  const [tab, setTab] = useState<LogTab>("progress");

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/english/journal", { credentials: "include" });
      if (r.ok) setJ(await r.json());
    })();
  }, []);

  if (!j) return <p className="muted">{t("vocab_loading")}</p>;

  const goal = j.daily_goal || 30;
  const lo = j.level_lo ?? 0;
  const hi = j.level_hi ?? lo + 40;
  const lvl = j.level || 1;
  const into = Math.max(0, (j.xp || 0) - lo);
  const span = Math.max(1, hi - lo);
  const overall = j.accuracy?.overall ?? null;
  const totalAns = j.accuracy?.total || 0;
  const heat = j.heat || [];
  const weeks = Math.max(12, Math.ceil(heat.length / 7) || 12);
  const stRank = j.st_rank || j.rank || "—";
  const mistakesN = (j.mistakes || []).length;
  const badgesOk = (j.badges || []).filter((b) => b.ok).length;

  return (
    <section className="en-log">
      <div className="en-log-tabs" role="tablist" aria-label={t("en_log")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "progress"}
          className={`en-log-tab${tab === "progress" ? " on" : ""}`}
          onClick={() => setTab("progress")}
        >
          {t("en_log_tab_progress")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marks"}
          className={`en-log-tab${tab === "marks" ? " on" : ""}`}
          onClick={() => setTab("marks")}
        >
          {t("en_log_tab_marks")}
          <span className="en-log-tab-meta">
            {badgesOk}/{ (j.badges || []).length || 12 }
            {mistakesN ? ` · ${mistakesN}` : ""}
          </span>
        </button>
      </div>

      {tab === "progress" ? (
        <div className="en-log-pane en-log-pane-progress" role="tabpanel">
          <div className="en-log-grid3">
            <div className="inst-panel">
              <div className="lab">{t("en_pilot_telemetry")}</div>
              <dl className="en-log-readouts">
                <div>
                  <dt>{t("en_level")}</dt>
                  <dd className="cyan">{lvl}</dd>
                </div>
                <div>
                  <dt>{t("en_xp_english")}</dt>
                  <dd className="amber">{j.xp}</dd>
                </div>
                <div>
                  <dt>{t("en_st_rank")}</dt>
                  <dd className="purple">{stRank}</dd>
                </div>
                <div>
                  <dt>{t("en_streak_best")}</dt>
                  <dd className="ok">
                    {j.streak_days || 0} / {j.best_streak || j.streak_days || 0}
                  </dd>
                </div>
                <div>
                  <dt>{t("en_xp_today")}</dt>
                  <dd>
                    {j.xp_today || 0} / {goal} XP
                  </dd>
                </div>
              </dl>
              <SegmentBar
                label={t("en_to_level").replace("{0}", String(lvl + 1))}
                value={into}
                total={span}
                tone="cyan"
              />
            </div>

            <div className="inst-panel">
              <div className="lab">{t("en_set_mastery")}</div>
              <ul className="en-log-sets">
                {(j.sets || []).map((s) => (
                  <li key={s.id}>
                    <SegmentBar
                      label={s.name}
                      value={s.known}
                      total={Math.max(1, s.total)}
                      tone={s.known >= s.total && s.total > 0 ? "ok" : "amber"}
                    />
                  </li>
                ))}
                {!(j.sets || []).length && <li className="muted">—</li>}
              </ul>
            </div>

            <div className="inst-panel en-log-acc">
              <div className="lab">{t("en_accuracy_modes")}</div>
              <RingGauge pct={overall} answers={totalAns} />
              <dl className="en-log-modes">
                {MODE_KEYS.map(({ id, label }) => {
                  const m = j.accuracy?.modes?.[id];
                  const txt =
                    m && m.n ? `${Math.round((100 * m.ok) / m.n)}% · ${m.n}` : "—";
                  return (
                    <div key={id}>
                      <dt>{t(label)}</dt>
                      <dd>{txt}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>

          <div className="inst-panel en-log-heat-panel">
            <div className="lab">{t("en_activity_heat")}</div>
            <div className="en-heat-wrap">
              <div className="en-heat">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <div
                    key={`row-${d}`}
                    className="en-heat-row"
                    style={{ gridTemplateColumns: `1.8rem repeat(${weeks}, minmax(0, 0.72rem))` }}
                  >
                    <span className="en-heat-lab">{HEAT_DAY_LABS[d]}</span>
                    {Array.from({ length: weeks }, (_, wk) => {
                      const cell = heat[wk * 7 + d];
                      const xp = cell?.xp || 0;
                      const cls = xp <= 0 ? "" : xp >= goal ? "goal" : "mid";
                      const today = cell?.today ? " today" : "";
                      return (
                        <span
                          key={`${d}-${wk}`}
                          className={`en-heat-cell ${cls}${today}`}
                          title={`${cell?.date || ""} · ${xp} XP`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="muted en-heat-legend">{t("en_heat_legend").replace("{0}", String(goal))}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="en-log-pane en-log-pane-marks" role="tabpanel">
          <div className="inst-panel en-log-badges-panel">
            <div className="lab">{t("en_badges")}</div>
            <div className="en-badge-grid">
              {(j.badges || []).map((b) => (
                <article key={b.id} className={`en-badge-card${b.ok ? " ok" : ""}`}>
                  <strong>
                    {b.ok ? "★ " : "☆ "}
                    {b.title}
                  </strong>
                  <p>
                    {b.desc || ""}
                    {b.bonus != null ? ` · +${b.bonus} XP` : ""}
                    {b.ok && b.date ? ` · ${b.date}` : ""}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="inst-panel en-log-mistakes-panel">
            <div className="en-mistakes-tag">
              {t("en_mistakes_7d")} · {mistakesN}
            </div>
            {mistakesN ? (
              <ul className="en-log-mistakes">
                {(j.mistakes || []).map((m, i) => (
                  <li key={`${m.word_id}-${i}`}>
                    <button type="button" className="linkish danger" onClick={() => onOpenWord(m.word)}>
                      {m.word}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("en_log_empty")}</p>
            )}
            <div className="bridge-actions">
              <button type="button" className="hud-btn amber" onClick={onMissionMistakes}>
                {t("en_repeat_mistakes_mission")}
              </button>
              <button type="button" className="hud-btn" onClick={onReviewMistakes}>
                {t("en_repeat_mistakes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
