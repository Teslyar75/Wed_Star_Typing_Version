/** Настройки Мостика — сетка панелей как EN / SR settings. */
import { useEffect, type ReactNode } from "react";
import { t } from "../i18n";
import ZoneSettingsShell from "../shell/ZoneSettingsShell";
import {
  useCabin,
  type CursorBlink,
  type FontSize,
  type TypingFace,
} from "../settings/cabinStore";

const FONTS: FontSize[] = ["S", "M", "L", "XL", "XXL"];
const BLINKS: CursorBlink[] = ["off", "on", "fast"];

const FACES: [TypingFace, string][] = [
  ["mono", "set_face_mono"],
  ["sans", "set_face_sans"],
  ["serif", "set_face_serif"],
  ["system", "set_face_system"],
];

function fontLabel(key: FontSize): string {
  return t(`set_font_${key.toLowerCase()}`);
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="bridge-set-row">
      <span className="bridge-set-lab">{label}</span>
      <div className="bridge-set-chips">{children}</div>
    </div>
  );
}

export default function BridgeSettingsPage() {
  const cabin = useCabin();

  useEffect(() => {
    useCabin.getState().hydrate();
  }, []);

  return (
    <ZoneSettingsShell
      className="bridge-settings"
      navGroup="bridge-settings"
      hint={t("bridge_settings_hint")}
      ariaLabel={t("bridge_settings")}
    >
        <div className="bridge-settings-grid">
          <div className="inst-panel">
            <div className="lab">{t("bridge_set_sight_lab")}</div>
            <ChipRow label={t("set_sight")}>
              <button
                type="button"
                className={`hud-btn ${cabin.sight ? "ok" : ""}`}
                onClick={() => cabin.toggle("sight")}
              >
                {cabin.sight ? t("set_on") : t("set_off")}
              </button>
              <span className="muted bridge-set-note">{t("set_sight_desc")}</span>
            </ChipRow>
            <ChipRow label={t("set_cursor_font")}>
              {FONTS.map((key) => (
                <button
                  key={`cur-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.cursorFont === key ? "amber" : ""}`}
                  onClick={() => cabin.set("cursorFont", key)}
                >
                  {fontLabel(key)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_cursor_color")}>
              <label className="settings-color">
                <input
                  type="color"
                  value={cabin.cursorColor}
                  onChange={(e) => cabin.set("cursorColor", e.target.value)}
                  aria-label={t("set_cursor_color")}
                />
                <span className="muted">{cabin.cursorColor}</span>
              </label>
              <span className="muted bridge-set-note">{t("set_cursor_color_desc")}</span>
            </ChipRow>
            <ChipRow label={t("set_cursor_blink")}>
              {BLINKS.map((key) => (
                <button
                  key={`blink-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.cursorBlink === key ? "amber" : ""}`}
                  onClick={() => cabin.set("cursorBlink", key)}
                >
                  {t(`set_cursor_blink_${key}`)}
                </button>
              ))}
              <span className="muted bridge-set-note">{t("set_cursor_blink_desc")}</span>
            </ChipRow>
            <ChipRow label={t("set_keyboard")}>
              <button
                type="button"
                className={`hud-btn ${cabin.keyboard ? "ok" : ""}`}
                onClick={() => cabin.toggle("keyboard")}
              >
                {cabin.keyboard ? t("set_on") : t("set_off")}
              </button>
              <span className="muted bridge-set-note">{t("set_keyboard_desc")}</span>
            </ChipRow>
            <ChipRow label={t("set_zones")}>
              <button
                type="button"
                className={`hud-btn ${cabin.zones ? "ok" : ""}`}
                onClick={() => cabin.toggle("zones")}
              >
                {cabin.zones ? t("set_on") : t("set_off")}
              </button>
              <span className="muted bridge-set-note">{t("set_zones_desc")}</span>
            </ChipRow>
          </div>

          <div className="inst-panel">
            <div className="lab">{t("bridge_set_type_lab")}</div>
            <ChipRow label={t("set_font")}>
              {FONTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`hud-btn ${cabin.font === key ? "amber" : ""}`}
                  onClick={() => cabin.set("font", key)}
                >
                  {fontLabel(key)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_typed_font")}>
              {FONTS.map((key) => (
                <button
                  key={`t-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.typedFont === key ? "amber" : ""}`}
                  onClick={() => cabin.set("typedFont", key)}
                >
                  {fontLabel(key)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_ahead_font")}>
              {FONTS.map((key) => (
                <button
                  key={`a-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.aheadFont === key ? "amber" : ""}`}
                  onClick={() => cabin.set("aheadFont", key)}
                >
                  {fontLabel(key)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_typing_face")}>
              {FACES.map(([key, lab]) => (
                <button
                  key={key}
                  type="button"
                  className={`hud-btn ${cabin.typingFace === key ? "amber" : ""}`}
                  onClick={() => cabin.set("typingFace", key)}
                >
                  {t(lab)}
                </button>
              ))}
            </ChipRow>
          </div>

          <div className="inst-panel">
            <div className="lab">{t("bridge_set_color_lab")}</div>
            <ChipRow label={t("set_typed_color")}>
              <label className="settings-color">
                <input
                  type="color"
                  value={cabin.typedColor}
                  onChange={(e) => cabin.set("typedColor", e.target.value)}
                  aria-label={t("set_typed_color")}
                />
                <span className="muted">{cabin.typedColor}</span>
              </label>
              <span className="muted bridge-set-note">{t("set_typed_color_desc")}</span>
            </ChipRow>
            <ChipRow label={t("set_ahead_color")}>
              <label className="settings-color">
                <input
                  type="color"
                  value={cabin.aheadColor}
                  onChange={(e) => cabin.set("aheadColor", e.target.value)}
                  aria-label={t("set_ahead_color")}
                />
                <span className="muted">{cabin.aheadColor}</span>
              </label>
              <span className="muted bridge-set-note">{t("set_ahead_color_desc")}</span>
            </ChipRow>
          </div>

          <div className="inst-panel">
            <div className="lab">{t("bridge_set_box_lab")}</div>
            <ChipRow label={t("set_sight_box_font")}>
              {FONTS.map((key) => (
                <button
                  key={`box-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.sightBoxFont === key ? "amber" : ""}`}
                  onClick={() => cabin.set("sightBoxFont", key)}
                >
                  {fontLabel(key)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_sight_box_face")}>
              {FACES.map(([key, lab]) => (
                <button
                  key={`box-face-${key}`}
                  type="button"
                  className={`hud-btn ${cabin.sightBoxFace === key ? "amber" : ""}`}
                  onClick={() => cabin.set("sightBoxFace", key)}
                >
                  {t(lab)}
                </button>
              ))}
            </ChipRow>
            <ChipRow label={t("set_sight_on_color")}>
              <label className="settings-color">
                <input
                  type="color"
                  value={cabin.sightOnColor}
                  onChange={(e) => cabin.set("sightOnColor", e.target.value)}
                  aria-label={t("set_sight_on_color")}
                />
                <span className="muted">{cabin.sightOnColor}</span>
              </label>
              <span className="muted bridge-set-note">{t("set_sight_on_color_desc")}</span>
            </ChipRow>
          </div>
        </div>
    </ZoneSettingsShell>
  );
}
