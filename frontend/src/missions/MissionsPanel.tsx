/** Звёздная карта миссий — паритет stamina/screens.MissionsScreen. */
import { useCallback, useEffect, useState } from "react";
import { type Drill, missionAccent, missionKeycaps } from "../bridge/MissionRail";
import { t } from "../i18n";

type Props = {
  onOpenBridge?: () => void;
  onOpenCargo?: () => void;
};

const PASS_ACC = 92;
const PENDING_KEY = "st_pending_drill";

function Stars({ n }: { n: number }) {
  return <span className="stars">{"★".repeat(n)}{"☆".repeat(Math.max(0, 3 - n))}</span>;
}

export default function MissionsPanel({ onOpenBridge, onOpenCargo }: Props) {
  const [lang, setLang] = useState<"en" | "ru">("en");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [weakKeys, setWeakKeys] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await (await fetch(`/api/missions/drills?lang=${lang}`, { credentials: "include" })).json();
    setDrills(Array.isArray(list) ? list : []);
    const r = await fetch("/api/missions/key-errors?limit=6", { credentials: "include" });
    if (r.ok) {
      const rows = (await r.json()) as { key: string; rate: number }[];
      setWeakKeys(rows.slice(0, 4).map((x) => x.key));
    } else {
      setWeakKeys([]);
    }
  }, [lang]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const launchDrill = async (d: Drill) => {
    if (!d.unlocked) {
      setHint(t("mission_closed_hint"));
      window.setTimeout(() => setHint(null), 2800);
      return;
    }
    const r = await fetch(`/api/missions/drills/${d.id}/start`, { method: "POST", credentials: "include" });
    if (!r.ok) {
      setHint(t("mission_closed_hint"));
      window.setTimeout(() => setHint(null), 2800);
      return;
    }
    const j = await r.json();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: j.mission_id, text: j.text, lang }));
    onOpenBridge?.();
  };

  const launchRepair = async () => {
    const r = await fetch("/api/missions/repair/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, weak: weakKeys }),
    });
    if (!r.ok) return;
    const j = await r.json();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: "repair", text: j.text, lang }));
    onOpenBridge?.();
  };

  return (
    <section className="missions-map">
      <header className="missions-map-head">
        <div>
          <h2 className="route-title">{t("star_map")}</h2>
          <p className="muted missions-blurb">
            {t("mission_blurb").replace("{0}", String(PASS_ACC))}
          </p>
        </div>
        <div className="missions-lang">
          <button
            type="button"
            className={`hud-btn ${lang === "en" ? "on" : ""}`}
            onClick={() => setLang("en")}
          >
            ENGLISH QWERTY
          </button>
          <button
            type="button"
            className={`hud-btn ${lang === "ru" ? "on" : ""}`}
            onClick={() => setLang("ru")}
          >
            {t("russian_layout")}
          </button>
        </div>
      </header>

      {hint ? <p className="mission-map-hint">{hint}</p> : null}

      <div className="mission-grid" role="list">
        {drills.map((d) => {
          const tone = missionAccent(d);
          const caps = missionKeycaps(d);
          return (
            <button
              key={d.id}
              type="button"
              role="listitem"
              className={`mission-card tone-${tone}`}
              aria-disabled={!d.unlocked}
              onClick={() => void launchDrill(d)}
            >
              <div className="mc-top">
                <span className="mc-id">
                  {d.lang.toUpperCase()}-{String(d.num).padStart(2, "0")}
                </span>
                <span className="mc-sector">{d.sector}</span>
              </div>
              <div className="mc-title">{d.title}</div>
              <div className="mc-new muted">
                {d.new ? t("new_keys") : t("all_letters")}
              </div>
              <div className="mc-keys" aria-hidden>
                {caps.map((cap) => (
                  <span key={cap} className="mc-keycap">
                    {cap}
                  </span>
                ))}
              </div>
              <div className="mc-foot">
                <span className="mc-goal">
                  {t("goal_cpm").replace("{0}", String(d.goal))}
                </span>
                {d.unlocked ? (
                  <span className="mc-score">
                    {d.best_cpm ? (
                      <span className="mc-rec muted">{t("record_cpm").replace("{0}", String(Math.round(d.best_cpm)))}</span>
                    ) : null}
                    <Stars n={d.best_stars} />
                  </span>
                ) : (
                  <span className="mc-locked">{t("mission_locked")}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="missions-special">
        <aside className="inst-panel mission-special tone-amber">
          <h3>{t("repair_systems")}</h3>
          <div className="mission-special-body">
            <p className="muted">
              {weakKeys.length
                ? t("weak_keys").replace("{0}", weakKeys.map((k) => `«${k}»`).join("  "))
                : t("repair_need_data")}
            </p>
            <button type="button" className="hud-btn amber" onClick={() => void launchRepair()}>
              ⚙ {t("launch")}
            </button>
          </div>
        </aside>
        <aside className="inst-panel mission-special">
          <h3>{t("cargo_on_board")}</h3>
          <div className="mission-special-body">
            <p className="muted">{t("cargo_hint")}</p>
            <button
              type="button"
              className="hud-btn"
              style={{ color: "var(--st-ok)", borderColor: "color-mix(in srgb, var(--st-ok) 55%, var(--st-line))" }}
              onClick={() => (onOpenCargo ? onOpenCargo() : onOpenBridge?.())}
            >
              ▶ {t("continue")}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
