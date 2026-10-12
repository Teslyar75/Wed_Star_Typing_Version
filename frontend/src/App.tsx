import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import BridgeScreen from "./bridge/BridgeScreen";
import SpaceCanvas from "./fx/SpaceCanvas";
import HelpDrawer from "./shell/HelpDrawer";
import CommandPalette from "./shell/CommandPalette";
import { bootSkin, useSkin } from "./theme/skinStore";
import { detectSpaceProfile } from "./fx/canvasBudget";
import { t, setLang, getLang, onLangChange } from "./i18n";
import { setSoundsMuted, soundsMuted } from "./fx/sounds";
import type { Tab } from "./shell/tabs";
import RadioMinibar from "./radio/RadioMinibar";
import RadioAudioHost from "./radio/RadioAudioHost";
import { useCabin } from "./settings/cabinStore";

type SpaceProfile = "frost" | "light" | "full";

const EnglishPanel = lazy(() => import("./english/EnglishPanel"));
const SpeedReadPanel = lazy(() => import("./speedread/SpeedReadPanel"));
const MissionsPanel = lazy(() => import("./missions/MissionsPanel"));
const SettingsHub = lazy(() => import("./settings/SettingsHub"));
const CargoPanel = lazy(() => import("./cargo/CargoPanel"));
const FlightLogPanel = lazy(() => import("./flightlog/FlightLogPanel"));
const LoungePanel = lazy(() => import("./lounge/LoungePanel"));
const RadioPanel = lazy(() => import("./radio/RadioPanel"));

function TabFallback() {
  return <p className="muted">…</p>;
}

function LazyTab({ when, children }: { when: boolean; children: ReactNode }) {
  if (!when) return null;
  return <Suspense fallback={<TabFallback />}>{children}</Suspense>;
}

type PilotChip = { callsign: string; rank?: string; xp?: number; xp_next?: number };

export default function App() {
  const [tab, setTab] = useState<Tab>("bridge");
  const [lang, setLangState] = useState(getLang());
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [spaceProfile, setSpaceProfile] = useState<SpaceProfile>(() =>
    detectSpaceProfile(localStorage.getItem("st_space_profile")) || "full",
  );
  const [muted, setMuted] = useState(() => soundsMuted());
  const [pilot, setPilot] = useState<PilotChip | null>(null);
  const [, bump] = useState(0);
  const skin = useSkin((s) => s.skin);
  const skinGen = useSkin((s) => s.gen);
  const starsOn = useCabin((s) => s.stars);

  useEffect(() => {
    bootSkin({ preferBase: true });
    useCabin.getState().hydrate();
    if (!localStorage.getItem("st_space_profile")) {
      localStorage.setItem("st_space_profile", "full");
      setSpaceProfile("full");
    }
    void (async () => {
      try {
        const me = await fetch("/api/pilots/me", { credentials: "include" });
        if (me.ok) {
          const j = await me.json();
          setPilot({
            callsign: j.callsign || j.name || t("pilot"),
            rank: j.rank,
            xp: j.xp,
            xp_next: j.xp_next ?? j.xp_to_next,
          });
        }
      } catch {
        /* guest */
      }
    })();
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
    { id: "missions", label: t("missions") },
    { id: "cargo", label: t("own_text") },
    { id: "log", label: t("flight_log") },
    { id: "english", label: t("english") },
    { id: "speed", label: t("speed") },
    { id: "lounge", label: t("lounge") },
    { id: "radio", label: t("radio") },
    { id: "settings", label: t("settings") },
  ];

  return (
    <div className="cockpit cockpit-desktop" data-skin={skin.id}>
      {starsOn && (
        <div className={`space-bg space-bg-${spaceProfile}`} aria-hidden key={`bg-${skin.id}-${skinGen}`}>
          <SpaceCanvas
            key={`space-${skin.id}-${skinGen}-${spaceProfile}`}
            profile={spaceProfile === "frost" ? "frost" : spaceProfile === "light" ? "light" : "full"}
            fullBleed
            className="space-canvas full"
          />
        </div>
      )}

      <header className="top-bar">
        <div className="brand">
          <div className="brand-title">★ STAR TYPING</div>
          <div className="brand-sub">{t("console_sub")}</div>
        </div>
        <nav className="top-nav" aria-label="main">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`nav-tab ${tab === x.id ? "on" : ""}`}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </nav>
        <div className="top-right">
          {pilot ? (
            <div className="pilot-chip">
              <strong>{pilot.callsign}</strong>
              {pilot.rank ? <span className="muted"> · {pilot.rank}</span> : null}
              {pilot.xp != null ? (
                <span className="xp">
                  {" "}
                  ★ {pilot.xp}
                  {pilot.xp_next != null ? ` / ${pilot.xp_next}` : ""} XP
                </span>
              ) : null}
            </div>
          ) : (
            <button type="button" className="hud-btn" onClick={() => setTab("settings")}>
              {t("crew")}
            </button>
          )}
          <RadioMinibar onOpen={() => setTab("radio")} />
          <button
            type="button"
            className="hud-btn hud-btn-icon amber"
            onClick={() => setHelpOpen(true)}
            title="F1"
            aria-label="F1"
          >
            ?
          </button>
          <button
            type="button"
            className={`hud-btn hud-btn-icon ${muted ? "" : "on"}`}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setSoundsMuted(next);
            }}
            title={muted ? t("sound_off") : t("sound_on")}
            aria-label={muted ? t("sound_off") : t("sound_on")}
          >
            {muted ? "♪̸" : "♪"}
          </button>
        </div>
      </header>
      <RadioAudioHost />

      <main className="stage">
        {tab === "bridge" && <BridgeScreen />}
        <LazyTab when={tab === "missions"}>
          <MissionsPanel onOpenBridge={() => setTab("bridge")} onOpenCargo={() => setTab("cargo")} />
        </LazyTab>
        <LazyTab when={tab === "cargo"}>
          <CargoPanel onOpenBridge={() => setTab("bridge")} />
        </LazyTab>
        <LazyTab when={tab === "log"}>
          <FlightLogPanel onOpenBridge={() => setTab("bridge")} onOpenHonor={() => setTab("settings")} />
        </LazyTab>
        <LazyTab when={tab === "english"}>
          <EnglishPanel />
        </LazyTab>
        <LazyTab when={tab === "speed"}>
          <SpeedReadPanel />
        </LazyTab>
        <LazyTab when={tab === "lounge"}>
          <LoungePanel />
        </LazyTab>
        <LazyTab when={tab === "radio"}>
          <RadioPanel />
        </LazyTab>
        <LazyTab when={tab === "settings"}>
          <SettingsHub
            spaceProfile={spaceProfile}
            onSpaceProfile={setProfile}
            lang={lang}
            onLang={switchLang}
            onOpenBridge={() => setTab("bridge")}
            onOpenEnglish={() => setTab("english")}
            onOpenSpeed={() => setTab("speed")}
          />
        </LazyTab>
      </main>

      <HelpDrawer tab={tab} open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onJump={(x) => setTab(x as Tab)} />
    </div>
  );
}
