import { ALL_SKINS, useSkin } from "./skinStore";
import { t } from "../i18n";
import { useUiVariant } from "../shell/uiVariant";
import "../shell/compartmentHeader.css";
import { playClick, setSoundsMuted, soundsMuted } from "../fx/sounds";

export default function SkinPicker() {
  const skin = useSkin((s) => s.skin);
  const setSkin = useSkin((s) => s.setSkin);
  const muted = soundsMuted();
  const variant = useUiVariant((s) => s.variant);
  const setVariant = useUiVariant((s) => s.setVariant);

  return (
    <div className="skins">
      <div className="ui-variant-row" role="radiogroup" aria-label={t("alt_variant")}>
        <strong>{t("alt_variant")}:</strong>
        {(["classic", "alt"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={variant === v}
            data-variant={v}
            className={`hud-btn ${variant === v ? "amber" : ""}`}
            onClick={() => {
              setVariant(v);
              playClick();
            }}
          >
            {t(v === "alt" ? "alt_variant_alt" : "alt_variant_classic")}
          </button>
        ))}
        <span className="muted">
          {t("alt_skin_variant")}: {(skin.name as Record<string, string>)?.ru || skin.id} +{" "}
          {t(variant === "alt" ? "alt_variant_alt" : "alt_variant_classic")}
        </span>
      </div>
      <p className="muted">
        Эталон — «Звездолёт» (звёздное небо). При смене — полный сброс артефактов. Другие скины: пока только палитра.
      </p>
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
            <strong>
              {(s.name as Record<string, string>)?.ru || s.id}
              {s.id === "spaceship" ? " · базовый" : ""}
            </strong>
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
          onClick={() => setSoundsMuted(!muted)}
        >
          {muted ? t("sound_off") : t("sound_on")}
        </button>
      </div>
    </div>
  );
}
