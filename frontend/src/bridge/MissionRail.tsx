/** Компактный список миссий (мостик) + тип Drill для API. */
import { t } from "../i18n";

export type Drill = {
  id: string;
  lang: string;
  num: number;
  title: string;
  sector: string;
  keys: string;
  new: string;
  goal: number;
  unlocked: boolean;
  best_stars: number;
  attempts?: number;
  best_cpm?: number | null;
};

type Props = {
  drills: Drill[];
  activeId: string | null;
  lastStars: number | null;
  onStart: (id: string) => void;
  onRepair: () => void;
};

function Stars({ n }: { n: number }) {
  return <span className="stars">{"★".repeat(n)}{"☆".repeat(Math.max(0, 3 - n))}</span>;
}

export default function MissionRail({ drills, activeId, lastStars, onStart, onRepair }: Props) {
  return (
    <div className="mission-rail">
      <div className="bridge-actions">
        <strong>{t("mission_map")}</strong>
        <button type="button" className="hud-btn" onClick={onRepair}>
          {t("repair")}
        </button>
      </div>
      {lastStars != null && lastStars > 0 && (
        <p className="mission-flash">
          {t("mission_stars")}: <Stars n={lastStars} />
        </p>
      )}
      <ul className="mission-list" data-nav-group="missions">
        {drills.map((d) => (
          <li key={d.id} className={`${d.unlocked ? "" : "locked"} ${activeId === d.id ? "on" : ""}`}>
            <button type="button" className="hud-btn" disabled={!d.unlocked} onClick={() => onStart(d.id)}>
              {d.num}. {d.title}
            </button>
            <span className="muted">
              {d.sector} · {d.goal} CPM · <Stars n={d.best_stars} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Капсулы новых клавиш для карточки миссии. */
export function missionKeycaps(d: Pick<Drill, "new" | "lang">): string[] {
  const neu = d.new ?? "";
  if (!neu) return d.lang === "ru" ? ["А–Я"] : ["A–Z"];
  if (neu === "0123456789" || /^\d+$/.test(neu)) return ["0–9"];
  return [...neu.toUpperCase()];
}

export function missionAccent(d: Pick<Drill, "unlocked" | "best_stars">): "locked" | "done" | "ready" {
  if (!d.unlocked) return "locked";
  if (d.best_stars > 0) return "done";
  return "ready";
}
