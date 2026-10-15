import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { t, getLang } from "../i18n";
import type { SpaceProfile } from "../fx/livingSpace";
import {
  setFxVolume,
  setSoundsMuted,
  soundsMuted,
  setFxBank,
  getFxBank,
  playClick,
  playError,
} from "../fx/sounds";
import {
  useCabin,
  type GlowLevel,
  type UiScale,
  type UplinkTarget,
} from "./cabinStore";
import { ALL_SKINS, useSkin } from "../theme/skinStore";
import { registerGoHandler, setDeepRoute } from "../shell/routeStore";

const SkinPicker = lazy(() => import("../theme/SkinPicker"));
const AuthPanel = lazy(() => import("../auth/AuthPanel"));

type Sub = "cabin" | "cabinMore" | "skins" | "crew";

type Props = {
  spaceProfile: SpaceProfile;
  onSpaceProfile: (p: SpaceProfile) => void;
  lang: string;
  onLang: (code: string) => void;
};

function Block({ when, children }: { when: boolean; children: ReactNode }) {
  if (!when) return null;
  return <Suspense fallback={<p className="muted">…</p>}>{children}</Suspense>;
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="settings-sys-row">
      <div className="settings-sys-left">
        <div className="settings-sys-title">{title}</div>
        <p className="muted settings-sys-desc">{desc}</p>
      </div>
      <div className="settings-sys-right">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`hud-btn settings-toggle ${on ? "ok" : ""}`} onClick={onClick}>
      {on ? `● ${t("set_on")}` : `○ ${t("set_off")}`}
    </button>
  );
}

function skinLabel(name: Record<string, string> | string | undefined): string {
  if (!name) return "—";
  if (typeof name === "string") return name;
  const code = getLang();
  return name[code] || name.ru || name.en || Object.values(name)[0] || "—";
}

export default function SettingsHub({
  spaceProfile,
  onSpaceProfile,
  lang,
  onLang,
}: Props) {
  const [sub, setSub] = useState<Sub>("cabin");
  const cabin = useCabin();
  const skinId = useSkin((s) => s.skin.id);
  const setSkin = useSkin((s) => s.setSkin);
  const [fxBank, setBank] = useState(() => getFxBank());

  useEffect(() => {
    useCabin.getState().hydrate();
  }, []);

  useEffect(() => {
    setSoundsMuted(!cabin.sound);
    setFxVolume(cabin.volume / 4);
  }, [cabin.sound, cabin.volume]);

  const subs: { id: Sub; label: string }[] = [
    { id: "cabin", label: t("set_systems") },
    { id: "cabinMore", label: t("set_more") },
    { id: "skins", label: t("skins") },
    { id: "crew", label: t("crew") },
  ];

  useEffect(() => {
    const meta = subs.find((s) => s.id === sub);
    setDeepRoute([{ slug: sub, label: meta?.label || sub }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  useEffect(() => {
    registerGoHandler((slugs) => {
      const id = slugs[0] as Sub | undefined;
      if (id && ["cabin", "cabinMore", "skins", "crew"].includes(id)) {
        setSub(id as Sub);
      }
    });
    return () => registerGoHandler(null);
  }, []);

  const langBtns: { code: string; name: string }[] = [
    { code: "ru", name: "Русский" },
    { code: "uk", name: "Українська" },
    { code: "en", name: "English" },
    { code: "de", name: "Deutsch" },
  ];

  const uplinkBtns: { code: UplinkTarget; name: string }[] = [
    { code: "", name: t("set_auto") },
    { code: "ru", name: "RU" },
    { code: "uk", name: "UK" },
    { code: "en", name: "EN" },
    { code: "de", name: "DE" },
  ];

  const living: { key: SpaceProfile; name: string }[] = [
    { key: "frost", name: t("set_living_off") },
    { key: "light", name: t("set_living_light") },
    { key: "full", name: t("set_living_full") },
  ];

  const scales: { key: UiScale; name: string }[] = [
    { key: "S", name: t("set_ui_s") },
    { key: "M", name: t("set_ui_m") },
    { key: "L", name: t("set_ui_l") },
    { key: "XL", name: t("set_ui_xl") },
    { key: "XXL", name: t("set_ui_xxl") },
  ];

  const glows: { key: GlowLevel; name: string }[] = [
    { key: "off", name: t("set_glow_off") },
    { key: "low", name: t("set_glow_low") },
    { key: "med", name: t("set_glow_med") },
    { key: "high", name: t("set_glow_high") },
  ];

  const testSound = () => {
    const was = soundsMuted();
    setSoundsMuted(false);
    playClick();
    window.setTimeout(() => playClick(), 160);
    window.setTimeout(() => playError(), 320);
    window.setTimeout(() => setSoundsMuted(was || !cabin.sound), 650);
  };

  return (
    <section className="settings-hub">
      <header className="route-head">
        <h2 className="route-title">{t("set_title")}</h2>
      </header>
      <nav className="tabs settings-subs">
        {subs.map((x) => (
          <button key={x.id} type="button" className={`tab ${sub === x.id ? "on" : ""}`} onClick={() => setSub(x.id)}>
            {x.label}
          </button>
        ))}
      </nav>

      {sub === "cabin" && (
        <div className="settings-cabin inst-panel">
          <div className="lab">{t("set_systems")}</div>

          <Row title={t("set_lang")} desc={t("set_lang_desc")}>
            {langBtns.map((b) => (
              <button
                key={b.code}
                type="button"
                className={`hud-btn ${lang === b.code ? "amber" : ""}`}
                onClick={() => onLang(b.code)}
              >
                {b.name}
              </button>
            ))}
          </Row>

          <Row title={t("set_key_sound")} desc={t("set_key_sound_desc")}>
            <Toggle on={cabin.sound} onClick={() => cabin.toggle("sound")} />
          </Row>

          <Row title={t("set_volume")} desc={t("set_volume_desc")}>
            {([1, 2, 3, 4] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`hud-btn ${cabin.volume === lvl ? "amber" : ""}`}
                onClick={() => {
                  cabin.set("volume", lvl);
                  setFxVolume(lvl / 4);
                  testSound();
                }}
              >
                {"▮".repeat(lvl)}
              </button>
            ))}
            <button type="button" className="hud-btn amber" onClick={testSound}>
              {t("set_test")}
            </button>
          </Row>

          <Row title={t("set_translator")} desc={t("set_translator_desc")}>
            <Toggle on={cabin.translator} onClick={() => cabin.toggle("translator")} />
          </Row>

          <Row title={t("set_uplink_to")} desc={t("set_uplink_to_desc")}>
            {uplinkBtns.map((b) => (
              <button
                key={b.code || "auto"}
                type="button"
                className={`hud-btn ${cabin.uplinkTarget === b.code ? "amber" : ""}`}
                onClick={() => cabin.set("uplinkTarget", b.code)}
              >
                {b.name}
              </button>
            ))}
          </Row>

          <Row title={t("set_stars")} desc={t("set_stars_desc")}>
            <Toggle on={cabin.stars} onClick={() => cabin.toggle("stars")} />
          </Row>

          <Row title={t("set_glow")} desc={t("set_glow_desc")}>
            {glows.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`hud-btn ${cabin.glow === b.key ? "amber" : ""}`}
                onClick={() => cabin.set("glow", b.key)}
              >
                {b.name}
              </button>
            ))}
          </Row>

          <Row title={t("set_living")} desc={t("set_living_desc")}>
            {living.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`hud-btn ${spaceProfile === b.key ? "amber" : ""}`}
                onClick={() => onSpaceProfile(b.key)}
              >
                {b.name}
              </button>
            ))}
          </Row>

          <div className="settings-sys-row settings-more-cta">
            <div className="settings-sys-left">
              <div className="settings-sys-title">{t("set_more")}</div>
              <p className="muted settings-sys-desc">{t("set_more_desc")}</p>
            </div>
            <div className="settings-sys-right">
              <button type="button" className="hud-btn amber" onClick={() => setSub("cabinMore")}>
                {t("set_more")} →
              </button>
            </div>
          </div>
        </div>
      )}

      {sub === "cabinMore" && (
        <div className="settings-cabin inst-panel">
          <div className="lab">{t("set_more")}</div>

          <Row title={t("set_skin")} desc={t("set_skin_desc")}>
            {ALL_SKINS.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`hud-btn ${skinId === th.id ? "amber" : ""}`}
                onClick={() => setSkin(th.id)}
              >
                {skinLabel(th.name)}
              </button>
            ))}
          </Row>

          <Row title={t("set_ui")} desc={t("set_ui_desc")}>
            {scales.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`hud-btn ${cabin.uiScale === b.key ? "amber" : ""}`}
                onClick={() => cabin.set("uiScale", b.key)}
              >
                {b.name}
              </button>
            ))}
          </Row>

          <Row title={t("set_data")} desc={t("set_data_desc")}>
            <span className="muted settings-data-path">localStorage · IndexedDB</span>
          </Row>

          <div className="settings-sys-row">
            <div className="settings-sys-left">
              <div className="settings-sys-title">FX</div>
              <p className="muted settings-sys-desc">{t("fx_vol")}</p>
            </div>
            <div className="settings-sys-right">
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  const next = fxBank === "alt" ? "default" : "alt";
                  setBank(next);
                  setFxBank(next);
                }}
              >
                FX: {fxBank}
              </button>
            </div>
          </div>

          <p className="muted settings-hotkeys">{t("set_hotkeys")}</p>

          <div className="settings-sys-row settings-more-cta">
            <div className="settings-sys-left">
              <div className="settings-sys-title">{t("set_systems")}</div>
              <p className="muted settings-sys-desc">{t("set_more_back_desc")}</p>
            </div>
            <div className="settings-sys-right">
              <button type="button" className="hud-btn" onClick={() => setSub("cabin")}>
                ← {t("set_systems")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Block when={sub === "skins"}>
        <SkinPicker />
      </Block>
      <Block when={sub === "crew"}>
        <AuthPanel />
      </Block>
    </section>
  );
}
