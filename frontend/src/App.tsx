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
import { applyTheme } from "./theme/applyTheme";
import { t, setLang, getLang, onLangChange } from "./i18n";
import spaceship from "../../packages/themes/spaceship.json";

type Tab = "bridge" | "reader" | "library" | "english" | "speed" | "auth" | "skins" | "radio" | "lounge";

export default function App() {
  const [tab, setTab] = useState<Tab>("bridge");
  const [health, setHealth] = useState(false);
  const [lang, setLangState] = useState(getLang());
  const [showOnboard, setShowOnboard] = useState(() => localStorage.getItem("st_onboard") !== "1");
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

  const dismissOnboard = () => {
    localStorage.setItem("st_onboard", "1");
    setShowOnboard(false);
  };

  const switchLang = (code: string) => {
    setLang(code);
    setLangState(code);
    bump((x) => x + 1);
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

  return (
    <div className="cockpit">
      <div className="space-bg space-bg-full" aria-hidden>
        <SpaceCanvas profile="light" fullBleed className="space-canvas full" />
      </div>
      <header className="hud-bar">
        <span className="logo">★</span>
        <h1>Star Typing Web</h1>
        <span className={`badge ${health ? "ok" : ""}`}>{health ? t("api_ok") : "…"}</span>
        <RadioMinibar onOpen={() => setTab("radio")} />
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
      <main className="panel wide">
        {showOnboard && (
          <div className="onboard" role="status">
            <div>
              <strong>{t("onboard_title")}</strong>
              <p className="muted">{t("onboard_body")}</p>
            </div>
            <button
              type="button"
              className="hud-btn amber"
              onClick={() => {
                dismissOnboard();
                setTab("auth");
              }}
            >
              {t("onboard_go")}
            </button>
            <button type="button" className="hud-btn" onClick={dismissOnboard}>
              {t("onboard_skip")}
            </button>
          </div>
        )}
        {tab === "bridge" && <BridgeScreen />}
        {tab === "reader" && <BilingualReader />}
        {tab === "library" && (
          <LibraryPanel onOpenReader={() => setTab("reader")} onOpenBridge={() => setTab("bridge")} />
        )}
        {tab === "english" && <EnglishPanel />}
        {tab === "speed" && <SpeedReadPanel />}
        {tab === "radio" && <RadioPanel />}
        {tab === "lounge" && <LoungePanel />}
        {tab === "auth" && <AuthPanel />}
        {tab === "skins" && <SkinPicker />}
      </main>
    </div>
  );
}
