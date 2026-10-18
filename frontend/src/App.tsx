import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import GuideDialog from "./guide/GuideDialog";
import GuideEvents, { bridgeName } from "./guide/GuideEvents";
import { useGuide } from "./guide/guideStore";
import { zoneName, zoneTrigger } from "./guide/zoneTriggers";
import BridgeScreen from "./bridge/BridgeScreen";
import SkinBackground, { bgEngineOf } from "./fx/SkinBackground";
import IdleSlideshow from "./idle/IdleSlideshow";
import HelpDrawer from "./shell/HelpDrawer";
import CommandPalette from "./shell/CommandPalette";
import { bootSkin, useSkin } from "./theme/skinStore";
import { skinRank } from "./theme/voice";
import { detectSpaceProfile } from "./fx/canvasBudget";
import { t, setLang, getLang, onLangChange } from "./i18n";
import { setSoundsMuted, soundsMuted } from "./fx/sounds";
import type { Tab } from "./shell/tabs";
import {
  cycleNavZone,
  focusNav,
  handleArrowNav,
  handleEscNav,
  handleTabNav,
  isTextEditTarget,
} from "./shell/keyboardNav";
import { ZONE_ORDER, homeTabForZone, isBridgeZone, zoneOf, type ZoneId } from "./shell/zones";
import PathCrumbs from "./shell/PathCrumbs";
import FullscreenButton from "./shell/FullscreenButton";
import SlideshowButton from "./idle/SlideshowButton";
import OrionCallButton from "./guide/OrionCallButton";
import { useElementFullscreen } from "./shell/useElementFullscreen";
import { clearDeepRoute } from "./shell/routeStore";
import RadioMinibar from "./radio/RadioMinibar";
import RadioAudioHost from "./radio/RadioAudioHost";
import { useCabin } from "./settings/cabinStore";
import { installStageFit } from "./shell/stageFit";
import TabErrorBoundary from "./shell/TabErrorBoundary";
import UpdateBanner from "./update/UpdateBanner";

const CockpitEntry = lazy(() => import("./auth/CockpitEntry"));
import { applyImportClient } from "./auth/applyImportClient";
const ASK_CREW_KEY = "st_ask_crew_on_start";

type SpaceProfile = "frost" | "light" | "full";

const EnglishPanel = lazy(() => import("./english/EnglishPanel"));
const SpeedReadPanel = lazy(() => import("./speedread/SpeedReadPanel"));
const MissionsPanel = lazy(() => import("./missions/MissionsPanel"));
const SettingsHub = lazy(() => import("./settings/SettingsHub"));
const CargoPanel = lazy(() => import("./cargo/CargoPanel"));
const FlightLogPanel = lazy(() => import("./flightlog/FlightLogPanel"));
const BridgeSettingsPage = lazy(() => import("./bridge/BridgeSettingsPage"));
const LoungePanel = lazy(() => import("./lounge/LoungePanel"));
const RadioPanel = lazy(() => import("./radio/RadioPanel"));

function TabFallback() {
  return <p className="muted">…</p>;
}

function LazyTab({ when, children, label }: { when: boolean; children: ReactNode; label?: string }) {
  if (!when) return null;
  return (
    <TabErrorBoundary label={label}>
      <Suspense fallback={<TabFallback />}>{children}</Suspense>
    </TabErrorBoundary>
  );
}

type PilotChip = { callsign: string; rank?: string; xp?: number; xp_next?: number };

export default function App() {
  const stageRef = useRef<HTMLElement>(null);
  const { fullscreen, toggleFullscreen } = useElementFullscreen(stageRef);
  const [tab, setTabState] = useState<Tab>("bridge");
  const [lang, setLangState] = useState(getLang());
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [spaceProfile, setSpaceProfile] = useState<SpaceProfile>(() =>
    detectSpaceProfile(localStorage.getItem("st_space_profile")) || "full",
  );
  const [muted, setMuted] = useState(() => soundsMuted());
  const [pilot, setPilot] = useState<PilotChip | null>(null);
  const [crewOpen, setCrewOpen] = useState(false);
  const [, bump] = useState(0);
  const skin = useSkin((s) => s.skin);
  const skinGen = useSkin((s) => s.gen);
  const starsOn = useCabin((s) => s.stars);
  /** Окно, которое было открыто до текущего — Backspace возвращает сюда. */
  const prevTabRef = useRef<Tab | null>(null);
  const tabRef = useRef<Tab>(tab);
  const helpRef = useRef(helpOpen);
  const cmdRef = useRef(cmdOpen);
  const crewRef = useRef(crewOpen);
  const topBarScrollRef = useRef<HTMLDivElement | null>(null);
  tabRef.current = tab;
  helpRef.current = helpOpen;
  cmdRef.current = cmdOpen;
  crewRef.current = crewOpen;

  const setTab = useCallback((next: Tab) => {
    /* Справка только по F1/? на уже выбранной вкладке — при смене раздела закрываем. */
    setHelpOpen(false);
    setCmdOpen(false);
    setTabState((cur) => {
      if (cur !== next) {
        prevTabRef.current = cur;
        /* смена зоны — сбросить глубокий хвост крошек */
        if (zoneOf(cur) !== zoneOf(next)) clearDeepRoute();
        if (
          next === "bridge" ||
          next === "missions" ||
          next === "cargo" ||
          next === "log" ||
          next === "bridgeSettings"
        ) {
          if (next === "bridge") clearDeepRoute();
        }
      }
      return next;
    });
  }, []);

  const setZone = useCallback(
    (zone: ZoneId) => {
      setTab(homeTabForZone(zone));
    },
    [setTab],
  );

  const goPrevWindow = useCallback(() => {
    const prev = prevTabRef.current;
    if (!prev || prev === tabRef.current) return;
    setTab(prev);
  }, [setTab]);

  useEffect(() => {
    return installStageFit(() => stageRef.current);
  }, []);

  /* Колёсико над полосой справа от brand → сдвиг всей полосы (вкладки + XP + радио + кнопки). */
  useEffect(() => {
    const el = topBarScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (!dx) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += dx;
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event("st-cabin-change"));
  }, [tab]);

  // гид: первый запуск — после входа в кабину (ждёт паузы в наборе)
  const pilotName = pilot?.callsign;
  const pilotRankRef = useRef<string | undefined>(undefined);
  pilotRankRef.current = pilot?.rank;
  useEffect(() => {
    if (!pilotName || crewOpen) return;
    const g = useGuide.getState();
    if (g.pilot !== pilotName) g.setPilot(pilotName);
    g.fire("first_launch", { skin: useSkin.getState().skin.id, onYes: () => setTab("bridge") });
    g.onEntry(pilotRankRef.current, { bridge: bridgeName() }, useSkin.getState().skin.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilotName, crewOpen]);
  // гид G2: первый вход в зону / подстраницу мостика (после first_launch, по общим лимитам)
  useEffect(() => {
    if (!pilotName || crewOpen) return;
    const tr = zoneTrigger(tab);
    if (!tr) return;
    const g = useGuide.getState();
    if (g.pilot !== pilotName) return;
    // ждём, пока first_launch не будет показан (он «съедает» мостик и запускает лимит)
    if (!g.st.seen.includes("first_launch") && g.st.id !== "none") return;
    g.fire(tr, { skin: useSkin.getState().skin.id, vars: { zone: zoneName(tab) } });
  }, [tab, pilotName, crewOpen]);
  useEffect(() => {
    bootSkin({ preferBase: true });
    useCabin.getState().hydrate();
    if (!localStorage.getItem("st_space_profile")) {
      localStorage.setItem("st_space_profile", "full");
      setSpaceProfile("full");
    }
    void (async () => {
      let hasPilot = false;
      try {
        const me = await fetch("/api/pilots/me", { credentials: "include" });
        if (me.ok) {
          const j = await me.json();
          if (j?.id || j?.callsign) {
            hasPilot = true;
            if (j.skin) useSkin.getState().setSkin(j.skin);
            setPilot({
              callsign: j.callsign || j.name || t("pilot"),
              rank: j.rank,
              xp: j.xp,
              xp_next: j.xp_next ?? j.xp_to_next,
            });
          }
        }
      } catch {
        /* guest */
      }
      if (!hasPilot && localStorage.getItem(ASK_CREW_KEY) !== "0") {
        setCrewOpen(true);
      }
    })();
    return onLangChange(() => {
      setLangState(getLang());
      bump((x) => x + 1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* Только явный F1 или Shift+/ (?). Не открывать при смене вкладок. */
      if (e.key === "F1" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTextEditTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTextEditTarget(e.target)) return;
        /* Не путать с другими клавишами раскладки — только литерал «?» */
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      /* Ctrl+1…6 — зоны (см. docs/web/NAV_ZONES.md) */
      if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[1-6]$/.test(e.key)) {
        if (isTextEditTarget(e.target)) return;
        const next = ZONE_ORDER[Number(e.key) - 1];
        if (next) {
          e.preventDefault();
          setZone(next);
          window.requestAnimationFrame(() => {
            const tab = document.querySelector<HTMLElement>(`.nav-tab[data-zone="${next}"]`);
            if (tab) focusNav(tab);
          });
        }
        return;
      }
      /* F6 — цикл шапка ↔ контент */
      if (e.key === "F6" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTextEditTarget(e.target)) return;
        e.preventDefault();
        cycleNavZone();
        return;
      }
      /* Tab / Shift+Tab — как десктоп keynav (меню зон ↔ кнопки) */
      if (handleTabNav(e)) return;
      if (handleArrowNav(e)) return;
      if (e.key === "Escape") {
        const onHud = handleEscNav(e);
        setHelpOpen(false);
        setCmdOpen(false);
        if (crewRef.current) setCrewOpen(false);
        if (onHud) return;
      }
      if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (helpRef.current || cmdRef.current || crewRef.current) return;
        if (isTextEditTarget(e.target)) return;
        if (!prevTabRef.current || prevTabRef.current === tabRef.current) return;
        e.preventDefault();
        goPrevWindow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrevWindow, setTab]);

  const switchLang = (code: string) => {
    setLang(code);
    setLangState(code);
    bump((x) => x + 1);
  };

  const setProfile = (p: SpaceProfile) => {
    setSpaceProfile(p);
    localStorage.setItem("st_space_profile", p);
  };

  const zoneTabs: { id: ZoneId; label: string }[] = [
    { id: "bridge", label: t("bridge") },
    { id: "english", label: t("english") },
    { id: "speed", label: t("speed") },
    { id: "lounge", label: t("lounge") },
    { id: "radio", label: t("radio") },
    { id: "settings", label: t("settings") },
  ];

  const bridgeSubs: { id: Tab; label: string }[] = [
    { id: "missions", label: t("missions") },
    { id: "cargo", label: t("own_text") },
    { id: "log", label: t("flight_log") },
    { id: "bridgeSettings", label: t("bridge_settings") },
  ];

  const activeZone = zoneOf(tab);

  return (
    <div className="cockpit cockpit-desktop" data-skin={skin.id}>
      {starsOn && (
        <div
          className={`space-bg space-bg-${spaceProfile} skin-bg skin-bg-${bgEngineOf(skin)}`}
          aria-hidden
          key={`bg-${skin.id}-${skinGen}`}
        >
          <SkinBackground
            key={`skin-bg-${skin.id}-${skinGen}-${spaceProfile}`}
            skin={skin}
            profile={spaceProfile === "frost" ? "frost" : spaceProfile === "light" ? "light" : "full"}
          />
        </div>
      )}

      <UpdateBanner
        onOpenSettings={() => {
          setTab("settings");
        }}
      />

      <header className="top-bar" data-nav-zone="chrome">
        <div className="brand">
          <div className="brand-title">★ STAR TYPING</div>
          <div className="brand-sub">{t("console_sub")}</div>
        </div>
        <div
          ref={topBarScrollRef}
          className="top-bar-scroll"
          title={t("nav_wheel_hint")}
        >
          <div className="top-bar-scroll-inner">
            <nav
              className="top-nav"
              aria-label="zones"
              role="tablist"
              data-nav-group="tabs"
            >
              {zoneTabs.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  data-zone={x.id}
                  data-tab={x.id}
                  data-nav-menu="1"
                  aria-selected={activeZone === x.id}
                  className={`nav-tab ${activeZone === x.id ? "on" : ""}`}
                  onClick={() => setZone(x.id)}
                >
                  {x.label}
                </button>
              ))}
            </nav>
            <div className="top-right" data-nav-group="chrome-tools">
              {pilot ? (
                <button type="button" className="pilot-chip" onClick={() => setCrewOpen(true)}>
                  <strong>{pilot.callsign}</strong>
                  {pilot.rank ? <span className="muted"> · {skinRank(pilot.rank, getLang())}</span> : null}
                  {pilot.xp != null ? (
                    <span className="xp">
                      {" "}
                      ★ {pilot.xp}
                      {pilot.xp_next != null ? ` / ${pilot.xp_next}` : ""} XP
                    </span>
                  ) : null}
                </button>
              ) : (
                <button type="button" className="hud-btn" onClick={() => setCrewOpen(true)}>
                  {t("crew")}
                </button>
              )}
              <RadioMinibar onOpen={() => setTab("radio")} />
              <button
                type="button"
                className="hud-btn hud-btn-icon amber"
                onClick={() => setHelpOpen((v) => !v)}
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
          </div>
        </div>
      </header>
      {!fullscreen ? (
        <div className="chrome-under-bar">
          <PathCrumbs tab={tab} onJump={setTab} />
          <div className="chrome-under-actions" data-nav-group="chrome-actions">
            <OrionCallButton />
            <SlideshowButton />
            <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
          </div>
        </div>
      ) : null}
      <RadioAudioHost />

      {isBridgeZone(tab) ? (
        <nav
          className="zone-subnav bridge-subnav"
          data-nav-group="bridge-sub"
          aria-label={t("bridge_subnav")}
        >
          {bridgeSubs.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`hud-btn ${tab === x.id ? "amber" : ""}`}
              data-tab={x.id}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </nav>
      ) : null}

      <main
        ref={stageRef}
        className={`stage ${fullscreen ? "is-fs" : ""}`}
        data-nav-zone="stage"
        data-nav-group="stage"
        tabIndex={-1}
      >
        {fullscreen ? (
          <div className="chrome-under-bar stage-fs-bar">
            <PathCrumbs tab={tab} onJump={setTab} />
            <div className="chrome-under-actions" data-nav-group="chrome-actions">
              <OrionCallButton />
              <SlideshowButton />
              <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
            </div>
          </div>
        ) : null}
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
        <LazyTab when={tab === "bridgeSettings"}>
          <BridgeSettingsPage />
        </LazyTab>
        <LazyTab when={tab === "english"}>
          <EnglishPanel />
        </LazyTab>
        <LazyTab when={tab === "speed"}>
          <SpeedReadPanel onOpenBridge={() => setTab("bridge")} />
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
            onGuideReplay={() => {
              setTab("bridge");
              useGuide.getState().fire("first_launch", { skin: useSkin.getState().skin.id, onYes: () => setTab("bridge") });
            }}
          />
        </LazyTab>
      </main>

      <HelpDrawer
        tab={tab}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onFullHelp={() => setTab("settings")}
      />
      <IdleSlideshow />
      <GuideDialog />
      <GuideEvents />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onJump={(x) => setTab(x as Tab)} />

      {crewOpen ? (
        <div className="crew-overlay-host" role="dialog" aria-modal="true" aria-label={t("crew")}>
          <Suspense fallback={<p className="muted">…</p>}>
            <CockpitEntry
              mode="gate"
              onEntered={(p) => {
                setPilot({ callsign: p.callsign, rank: p.rank, xp: p.xp, xp_next: p.xp_next });
                if (p.skin) useSkin.getState().setSkin(p.skin);
                setCrewOpen(false);
              }}
              onImportedClient={applyImportClient}
              onExit={() => setCrewOpen(false)}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
