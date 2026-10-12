import { useState } from "react";
import { applyTheme, type SkinTheme } from "./applyTheme";
import spaceship from "../../../packages/themes/spaceship.json";
import bathyscaphe from "../../../packages/themes/bathyscaphe.json";
import steampunk from "../../../packages/themes/steampunk.json";
import scriptorium from "../../../packages/themes/scriptorium.json";
import neonCity from "../../../packages/themes/neon_city.json";
import zenGarden from "../../../packages/themes/zen_garden.json";
import { t } from "../i18n";
import { playClick, setSoundsMuted, soundsMuted } from "../fx/sounds";

const SKINS = [spaceship, bathyscaphe, steampunk, scriptorium, neonCity, zenGarden] as SkinTheme[];

export default function SkinPicker() {
  const [id, setId] = useState("spaceship");
  const [muted, setMuted] = useState(soundsMuted());

  const pick = (skin: SkinTheme) => {
    setId(skin.id);
    applyTheme(skin);
  };

  return (
    <div className="skins">
      <div className="skin-grid">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`skin-card ${id === s.id ? "on" : ""}`}
            style={{ borderColor: s.colors.accent || s.colors.cyan }}
            onClick={() => pick(s)}
          >
            <strong>{(s.name as Record<string, string>)?.ru || s.id}</strong>
            <span className="swatch" style={{ background: s.colors.bg }} />
            <span className="swatch" style={{ background: s.colors.accent || s.colors.cyan }} />
          </button>
        ))}
      </div>
      <h3>{t("sound_radio")}</h3>
      <div className="bridge-actions">
        <button type="button" className="hud-btn" onClick={() => playClick()}>
          {t("click_test")}
        </button>
        <button
          type="button"
          className={`hud-btn ${muted ? "amber" : ""}`}
          onClick={() => {
            const next = !muted;
            setSoundsMuted(next);
            setMuted(next);
          }}
        >
          {muted ? t("sound_off") : t("sound_on")}
        </button>
      </div>
      <p className="muted">{t("radio_tab_hint")}</p>
    </div>
  );
}
