import { ALL_SKINS, useSkin } from "./skinStore";
import { t } from "../i18n";
import { playClick, setSoundsMuted, soundsMuted } from "../fx/sounds";

export default function SkinPicker() {
  const skin = useSkin((s) => s.skin);
  const setSkin = useSkin((s) => s.setSkin);
  const muted = soundsMuted();

  return (
    <div className="skins">
      <div className="skin-grid">
        {ALL_SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`skin-card ${skin.id === s.id ? "on" : ""}`}
            style={{ borderColor: s.colors.accent || s.colors.cyan }}
            onClick={() => {
              setSkin(s.id);
              playClick();
            }}
          >
            <strong>{(s.name as Record<string, string>)?.ru || s.id}</strong>
            <span className="swatch" style={{ background: s.colors.bg }} />
            <span className="swatch" style={{ background: s.colors.accent || s.colors.cyan }} />
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {s.background?.engine || "living_space"} · FX
            </span>
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
          onClick={() => setSoundsMuted(!muted)}
        >
          {muted ? t("sound_off") : t("sound_on")}
        </button>
      </div>
      <p className="muted">
        Per-skin: /sounds/skins/{skin.id} · backdrop: /skins/{skin.id}/bg1.jpg
      </p>
    </div>
  );
}
