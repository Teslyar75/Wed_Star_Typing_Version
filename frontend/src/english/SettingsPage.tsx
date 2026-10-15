/** НАСТРОЙКИ EN — две колонки как tab_08. */
import { useEffect, useState } from "react";
import { t } from "../i18n";
import ZoneSettingsShell from "../shell/ZoneSettingsShell";
import VoicePicker from "./VoicePicker";
import type { EnSettings } from "./types";

const DEFAULTS: EnSettings = {
  tts_rate: 1,
  auto_speak: false,
  asr: true,
  self_score: true,
  current_set: "top-3000",
  daily_goal: 30,
  new_per_day: 20,
  mission_len: 10,
  reverse_cards: false,
  xp_to_rank: true,
  warehouse_passes: 2,
};

const SETS = [
  { id: "top-1000", code: "S-1000" },
  { id: "top-3000", code: "S-3000" },
  { id: "top-10000", code: "S-10K" },
  { id: "top-20000", code: "S-20K" },
  { id: "dev-interview", code: "S-DEV" },
];

type Props = {
  onChange?: (s: EnSettings) => void;
};

export default function SettingsPage({ onChange }: Props) {
  const [s, setS] = useState<EnSettings>(DEFAULTS);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/english/settings", { credentials: "include" });
      if (r.ok) {
        const j = { ...DEFAULTS, ...(await r.json()) } as EnSettings;
        setS(j);
        onChange?.(j);
      }
    })();
  }, [onChange]);

  const patch = async (partial: Partial<EnSettings>) => {
    const next = { ...s, ...partial };
    setS(next);
    onChange?.(next);
    localStorage.setItem("st_en_auto_speak", next.auto_speak ? "1" : "0");
    const r = await fetch("/api/english/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (r.ok) setMsg(t("en_settings_saved"));
  };

  return (
    <ZoneSettingsShell className="en-settings" navGroup="en-settings" ariaLabel={t("settings")}>
        <div className="en-settings-grid">
        <div className="inst-panel">
          <div className="lab">{t("en_link_voice")}</div>
          <VoicePicker />
          {(
            [
              ["auto_speak", "en_auto_speak"],
              ["asr", "en_asr"],
              ["self_score", "en_self_score_opt"],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="en-set-row">
              <button
                type="button"
                className={`hud-btn en-chip ${s[key] ? "ok" : ""}`}
                onClick={() => void patch({ [key]: !s[key] })}
              >
                {s[key] ? "ВКЛ" : "ВЫКЛ"}
              </button>
              {t(lab)}
            </label>
          ))}
        </div>

        <div className="inst-panel">
          <div className="lab">{t("en_flight_mode")}</div>
          <div className="en-set-row">
            <span>{t("en_current_set")}</span>
            <div className="en-filter-row">
              {SETS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={`hud-btn en-chip ${s.current_set === x.id ? "amber" : ""}`}
                  onClick={() => void patch({ current_set: x.id })}
                >
                  {x.code}
                </button>
              ))}
            </div>
          </div>
          <div className="en-set-row">
            <span>{t("en_daily_goal_xp")}</span>
            <div className="en-filter-row">
              {[10, 30, 50, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hud-btn en-chip ${s.daily_goal === n ? "amber" : ""}`}
                  onClick={() => void patch({ daily_goal: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="en-set-row">
            <span>{t("en_new_per_day")}</span>
            <div className="en-filter-row">
              {[5, 10, 20, 40].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hud-btn en-chip ${s.new_per_day === n ? "amber" : ""}`}
                  onClick={() => void patch({ new_per_day: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="en-set-row">
            <span>{t("en_mission_len")}</span>
            <div className="en-filter-row">
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hud-btn en-chip ${s.mission_len === n ? "amber" : ""}`}
                  onClick={() => void patch({ mission_len: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ["reverse_cards", "en_reverse"],
              ["xp_to_rank", "en_xp_rank"],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="en-set-row">
              <button
                type="button"
                className={`hud-btn en-chip ${s[key] ? "ok" : ""}`}
                onClick={() => void patch({ [key]: !s[key] })}
              >
                {s[key] ? "ВКЛ" : "ВЫКЛ"}
              </button>
              {t(lab)}
            </label>
          ))}
          <div className="en-set-row">
            <span>{t("en_wh_passes")}</span>
            <div className="en-filter-row">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hud-btn en-chip ${s.warehouse_passes === n ? "amber" : ""}`}
                  onClick={() => void patch({ warehouse_passes: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
        {msg && <p className="muted en-settings-msg">{msg}</p>}
    </ZoneSettingsShell>
  );
}
