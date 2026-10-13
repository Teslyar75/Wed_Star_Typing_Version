/** Мини-плашка текущей миссии в шапке мостика — ширина под число клавиш. */
import { missionKeycaps } from "./MissionRail";
import { t } from "../i18n";

export type MissionBrief = {
  id: string;
  lang: string;
  num: number;
  title: string;
  sector: string;
  new: string;
  goal: number;
  best_stars?: number;
};

type Props = {
  mission: MissionBrief;
};

function Stars({ n }: { n: number }) {
  const k = Math.max(0, Math.min(3, n));
  return <span className="stars">{"★".repeat(k)}{"☆".repeat(3 - k)}</span>;
}

/** Плотность: few ≤2, mid 3–4, many 5+ */
function density(n: number): "few" | "mid" | "many" {
  if (n <= 2) return "few";
  if (n <= 4) return "mid";
  return "many";
}

export default function MissionMiniPlaque({ mission: m }: Props) {
  if (m.id === "repair") {
    return (
      <aside className="mission-mini tone-ready dens-few" aria-label={t("repair_systems")}>
        <div className="mm-top">
          <span className="mm-id">⚙</span>
          <span className="mm-sector">{t("repair")}</span>
        </div>
        <div className="mm-title">{t("repair_systems")}</div>
        <div className="mm-keys" aria-hidden>
          <span className="mm-keycap wide">⚙</span>
        </div>
        <div className="mm-foot">
          <span className="mm-goal">{t("repair")}</span>
        </div>
      </aside>
    );
  }

  const caps = missionKeycaps(m);
  const code = `${m.lang.toUpperCase()}-${String(m.num).padStart(2, "0")}`;
  const tone = (m.best_stars ?? 0) > 0 ? "done" : "ready";
  const dens = density(caps.length);

  return (
    <aside
      className={`mission-mini tone-${tone} dens-${dens}`}
      data-keys={caps.length}
      aria-label={`${code} ${m.title}`}
    >
      <div className="mm-top">
        <span className="mm-id">{code}</span>
        <span className="mm-sector">{m.sector}</span>
      </div>
      <div className="mm-title">{m.title}</div>
      <div className="mm-keys" aria-hidden>
        {caps.map((cap) => (
          <span key={cap} className={`mm-keycap${cap.length > 1 ? " wide" : ""}`}>
            {cap}
          </span>
        ))}
      </div>
      <div className="mm-foot">
        <span className="mm-goal">{t("goal_cpm").replace("{0}", String(m.goal))}</span>
        <Stars n={m.best_stars ?? 0} />
      </div>
    </aside>
  );
}
