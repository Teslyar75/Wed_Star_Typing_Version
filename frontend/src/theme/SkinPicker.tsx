import { useState } from "react";
import { applyTheme, type SkinTheme } from "./applyTheme";
import spaceship from "../../../packages/themes/spaceship.json";
import bathyscaphe from "../../../packages/themes/bathyscaphe.json";
import steampunk from "../../../packages/themes/steampunk.json";
import scriptorium from "../../../packages/themes/scriptorium.json";
import neonCity from "../../../packages/themes/neon_city.json";
import zenGarden from "../../../packages/themes/zen_garden.json";
import RadioPanel from "../radio/RadioPanel";

const SKINS = [spaceship, bathyscaphe, steampunk, scriptorium, neonCity, zenGarden] as SkinTheme[];

export default function SkinPicker() {
  const [id, setId] = useState("spaceship");

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
      <h3>Звук / радио</h3>
      <div className="bridge-actions">
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            const ctx = new AudioContext();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = 880;
            g.gain.value = 0.05;
            o.start();
            o.stop(ctx.currentTime + 0.05);
          }}
        >
          Тест щелчка
        </button>
      </div>
      <RadioPanel />
    </div>
  );
}
