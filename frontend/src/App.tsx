import { useEffect, useState } from "react";
import BridgeScreen from "./bridge/BridgeScreen";
import BilingualReader from "./reader/BilingualReader";
import EnglishPanel from "./english/EnglishPanel";
import SpeedReadPanel from "./speedread/SpeedReadPanel";
import AuthPanel from "./auth/AuthPanel";
import SkinPicker from "./theme/SkinPicker";
import SpaceCanvas from "./fx/SpaceCanvas";
import { applyTheme } from "./theme/applyTheme";
import { t, setLang, getLang, onLangChange } from "./i18n";
import spaceship from "../../packages/themes/spaceship.json";

type Tab = "bridge" | "reader" | "english" | "speed" | "auth" | "skins";

export default function App() {
  const [tab, setTab] = useState<Tab>("bridge");
  const [health, setHealth] = useState(false);
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    applyTheme(spaceship);
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(!!j.ok))
      .catch(() => setHealth(false));
    return onLangChange(() => setLangState(getLang()));
  }, []);

  const switchLang = (code: string) => {
    setLang(code);
    setLangState(code);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "bridge", label: t("bridge") },
    { id: "reader", label: t("reader") },
    { id: "english", label: t("english") },
    { id: "speed", label: t("speed") },
    { id: "auth", label: t("crew") },
    { id: "skins", label: t("skins") },
  ];

  return (
    <div className="cockpit">
      <div className="space-bg" aria-hidden>
        <SpaceCanvas />
      </div>
      <header className="hud-bar">
        <span className="logo">★</span>
        <h1>Star Typing Web</h1>
        <span className={`badge ${health ? "ok" : ""}`}>{health ? "API ok" : "…"}</span>
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
        {tab === "bridge" && <BridgeScreen />}
        {tab === "reader" && <BilingualReader />}
        {tab === "english" && <EnglishPanel />}
        {tab === "speed" && <SpeedReadPanel />}
        {tab === "auth" && <AuthPanel />}
        {tab === "skins" && <SkinPicker />}
      </main>
    </div>
  );
}
