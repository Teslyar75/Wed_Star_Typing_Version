import { useEffect, useState } from "react";
import BridgeScreen from "./bridge/BridgeScreen";
import BilingualReader from "./reader/BilingualReader";
import EnglishPanel from "./english/EnglishPanel";
import SpeedReadPanel from "./speedread/SpeedReadPanel";
import AuthPanel from "./auth/AuthPanel";
import SkinPicker from "./theme/SkinPicker";
import SpaceCanvas from "./fx/SpaceCanvas";
import RadioPanel from "./radio/RadioPanel";
import RadioMinibar from "./radio/RadioMinibar";
import LibraryPanel from "./library/LibraryPanel";
import LoungePanel from "./lounge/LoungePanel";
import HelpDrawer from "./shell/HelpDrawer";
import CommandPalette from "./shell/CommandPalette";
import { applyTheme } from "./theme/applyTheme";
import { t, setLang, getLang, onLangChange } from "./i18n";
import { getFxVolume, setFxVolume, setSoundsMuted, soundsMuted, setFxBank, getFxBank } from "./fx/sounds";
import spaceship from "../../packages/themes/spaceship.json";

type Tab = "bridge" | "reader" | "library" | "english" | "speed" | "auth" | "skins" | "radio" | "lounge";
type SpaceProfile = "frost" | "light" | "full";

export default function App() {
  const [tab, setTab] = useState<Tab>("bridge");
  const [health, setHealth] = useState(false);
  const [lang, setLangState] = useState(getLang());
  const [showOnboard, setShowOnboard] = useState(() => localStorage.getItem("st_onboard") !== "1");
  const [onboardStep, setOnboardStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [spaceProfile, setSpaceProfile] = useState<SpaceProfile>(
    () => (localStorage.getItem("st_space_profile") as SpaceProfile) || "light",
  );
  const [fxVol, setFxVol] = useState(() => getFxVolume());
  const [muted, setMuted] = useState(() => soundsMuted());
  const [fxBank, setBank] = useState(() => getFxBank());
  const [, bump] = useState(0);

  useEffect(() => {
    applyTheme(spaceship);
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(!!j.ok))
      .catch(() => setHealth(false));
    return onLangChange(() => {
      setLangState(getLang());
      bump((x) => x + 1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "?" || e.key === "F1") && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dismissOnboard = () => {
    localStorage.setItem("st_onboard", "1");
    setShowOnboard(false);
  };

  const switchLang = (code: string) => {
    setLang(code);
    setLangState(code);
    bump((x) => x + 1);
  };

  const setProfile = (p: SpaceProfile) => {
    setSpaceProfile(p);
    localStorage.setItem("st_space_profile", p);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "bridge", label: t("bridge") },
    { id: "reader", label: t("reader") },
    { id: "library", label: t("library") },
    { id: "english", label: t("english") },
    { id: "speed", label: t("speed") },
    { id: "radio", label: t("radio") },
    { id: "lounge", label: t("lounge") },
    { id: "auth", label: t("crew") },
    { id: "skins", label: t("skins") },
  ];

  const onboardCopy = [
    { title: t("onboard_title"), body: t("onboard_body"), go: "auth" as Tab },
    { title: t("missions"), body: "Мостик → миссия 1 · Стыковка · ★★★", go: "bridge" as Tab },
    { title: t("library"), body: "Полка → продолжить / English из книги", go: "library" as Tab },
    { title: t("english"), body: "Проверка карточек SM-2 · журнал sync", go: "english" as Tab },
  ];

  return (
    <div className="cockpit">
      <div className={`space-bg space-bg-${spaceProfile}`} aria-hidden>
        <SpaceCanvas profile={spaceProfile === "full" ? "full" : spaceProfile} fullBleed className="space-canvas full" />
      </div>
      <header className="hud-bar">
        <span className="logo">★</span>
        <h1>Star Typing Web</h1>
        <span className={`badge ${health ? "ok" : ""}`}>{health ? t("api_ok") : "…"}</span>
        <RadioMinibar onOpen={() => setTab("radio")} />
        <button type="button" className="hud-btn" onClick={() => setHelpOpen(true)} title="F1">
          {t("help")}
        </button>
        <button type="button" className="hud-btn" onClick={() => setCmdOpen(true)} title="Ctrl+K">
          ⌘K
        </button>
        <select className="lang-select" value={lang} onChange={(e) => switchLang(e.target.value)}>
          <option value="ru">RU</option>
          <option value="en">EN</option>
          <option value="uk">UK</option>
          <option value="de">DE</option>
        </select>
      </header>
      <nav className="tabs">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`tab ${tab === x.id ? "on" : ""}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </nav>
      <div className="bridge-actions shell-fx" style={{ padding: "0.25rem 0.75rem" }}>
        <button type="button" className="hud-btn" onClick={() => setProfile("frost")}>
          {t("space_frost")}
        </button>
        <button type="button" className="hud-btn" onClick={() => setProfile("light")}>
          {t("space_light")}
        </button>
        <button type="button" className="hud-btn" onClick={() => setProfile("full")}>
          {t("space_full")}
        </button>
        <label className="muted">
          {t("fx_vol")}{" "}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={fxVol}
            onChange={(e) => {
              const v = Number(e.target.value);
              setFxVol(v);
              setFxVolume(v);
            }}
          />
        </label>
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setSoundsMuted(next);
          }}
        >
          {muted ? t("sound_off") : t("sound_on")}
        </button>
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
      <main className="panel wide">
        {showOnboard && (
          <div className="onboard" role="status">
            <div>
              <strong>
                {onboardCopy[onboardStep]!.title} ({onboardStep + 1}/{onboardCopy.length})
              </strong>
              <p className="muted">{onboardCopy[onboardStep]!.body}</p>
            </div>
            {onboardStep < onboardCopy.length - 1 ? (
              <button type="button" className="hud-btn amber" onClick={() => setOnboardStep((s) => s + 1)}>
                →
              </button>
            ) : (
              <button
                type="button"
                className="hud-btn amber"
                onClick={() => {
                  dismissOnboard();
                  setTab(onboardCopy[onboardStep]!.go);
                }}
              >
                {t("onboard_go")}
              </button>
            )}
            <button
              type="button"
              className="hud-btn"
              onClick={() => {
                setTab(onboardCopy[onboardStep]!.go);
              }}
            >
              {onboardCopy[onboardStep]!.title}
            </button>
            <button type="button" className="hud-btn" onClick={dismissOnboard}>
              {t("onboard_skip")}
            </button>
          </div>
        )}
        {tab === "bridge" && <BridgeScreen />}
        {tab === "reader" && <BilingualReader />}
        {tab === "library" && (
          <LibraryPanel
            onOpenReader={() => setTab("reader")}
            onOpenBridge={() => setTab("bridge")}
            onOpenEnglish={() => setTab("english")}
            onOpenSpeed={() => setTab("speed")}
          />
        )}
        {tab === "english" && <EnglishPanel />}
        {tab === "speed" && <SpeedReadPanel />}
        {tab === "radio" && <RadioPanel />}
        {tab === "lounge" && <LoungePanel />}
        {tab === "auth" && <AuthPanel />}
        {tab === "skins" && <SkinPicker />}
      </main>
      <HelpDrawer tab={tab} open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onJump={(x) => setTab(x)} />
    </div>
  );
}
