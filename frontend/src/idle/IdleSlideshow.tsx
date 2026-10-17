/**
 * Простой (порт stamina/idle): через N мин без клавиатуры — слайдшоу скина + радио по жанрам.
 * ← → волна · ↑ ↓ громкость · M mute · любая другая клавиша / клик — выход (не уходит в набор).
 * Слайды сменяются сами каждые SLIDE_MS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSkin } from "../theme/skinStore";
import { useRadio } from "../radio/radioStore";
import { searchStations, type Station } from "../radio/api";
import { useIdle } from "./idleStore";
import { ti } from "./idleI18n";
import { dedupeStations, fadeVolume, isIdle, orderStations, stationGenre } from "./idleLogic";
import "./idle.css";

type Img = {
  provider: string;
  url: string;
  author?: string;
  author_url?: string;
  license?: string;
  source?: string;
  source_url?: string;
  title?: string;
  download_location?: string;
};

type SkinExtra = {
  radio?: { tags?: string[]; country?: string; pinned?: string[] };
  slideshow?: unknown;
};

const SLIDE_MS = 12_000;
const FADE_MS = 6_000;
const RADIO_TARGET = 0.3;
const VOL_STEP = 0.05;
const STATION_KEY = "st_idle_station";

export const IDLE_OPEN_EVENT = "st-idle-open";

function loadSavedStation(skinId: string): string | null {
  try {
    const j = JSON.parse(localStorage.getItem(STATION_KEY) || "{}") as Record<string, string>;
    return j[skinId] || null;
  } catch {
    return null;
  }
}

function saveStation(skinId: string, name: string) {
  try {
    const j = JSON.parse(localStorage.getItem(STATION_KEY) || "{}") as Record<string, string>;
    j[skinId] = name;
    localStorage.setItem(STATION_KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
}

export default function IdleSlideshow() {
  const skin = useSkin((s) => s.skin);
  const { minutes, radio, after, provider } = useIdle();
  const [open, setOpen] = useState(false);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [idx, setIdx] = useState(0);
  const [stations, setStations] = useState<Station[]>([]);
  const [stI, setStI] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volTarget, setVolTarget] = useState(RADIO_TARGET);
  const last = useRef(Date.now());
  const startedRadio = useRef(false);
  const fadeTimer = useRef(0);
  const stationsRef = useRef<Station[]>([]);
  const stIRef = useRef(0);
  const mutedRef = useRef(false);
  const volTargetRef = useRef(RADIO_TARGET);
  const radioFull = useRef(0.7);

  stationsRef.current = stations;
  stIRef.current = stI;
  mutedRef.current = muted;
  volTargetRef.current = volTarget;

  const stopFade = () => {
    if (fadeTimer.current) window.clearInterval(fadeTimer.current);
    fadeTimer.current = 0;
  };

  const fadeTo = useCallback((target: number) => {
    stopFade();
    const t0 = performance.now();
    fadeTimer.current = window.setInterval(() => {
      const a = useRadio.getState().audio;
      const el = performance.now() - t0;
      if (a) a.volume = fadeVolume(el, FADE_MS, target);
      if (el >= FADE_MS) stopFade();
    }, 150);
  }, []);

  const playStation = useCallback(
    (st: Station, fadeIn: boolean) => {
      const r = useRadio.getState();
      if (!r.audio) return;
      const target = Math.min(RADIO_TARGET, radioFull.current);
      setVolTarget(target);
      volTargetRef.current = target;
      setMuted(false);
      mutedRef.current = false;
      if (fadeIn) {
        if (r.audio) r.audio.volume = 0;
        r.play(st);
        startedRadio.current = true;
        fadeTo(target);
      } else {
        r.play(st);
        startedRadio.current = true;
        if (r.audio) r.audio.volume = mutedRef.current ? 0 : volTargetRef.current;
      }
      saveStation(skin.id, st.name);
    },
    [fadeTo, skin.id],
  );

  const loadStations = useCallback(async () => {
    const conf = (skin as unknown as SkinExtra).radio;
    if (!radio || !conf?.tags?.length) {
      setStations([]);
      return;
    }
    const r = useRadio.getState();
    radioFull.current = r.volume;
    const collected: Station[] = [];
    for (const tag of conf.tags) {
      try {
        const list = await searchStations({ tag, country: conf.country, limit: 24 });
        collected.push(...list);
      } catch {
        /* next tag */
      }
    }
    const ordered = orderStations(dedupeStations(collected), loadSavedStation(skin.id), conf.pinned);
    setStations(ordered);
    stationsRef.current = ordered;
    if (!ordered.length) return;
    setStI(0);
    stIRef.current = 0;
    if (!r.playing) playStation(ordered[0]!, true);
    else {
      /* уже играет — только список для ← → */
      startedRadio.current = false;
    }
  }, [skin, radio, playStation]);

  const openShow = useCallback(async () => {
    setOpen(true);
    setIdx(0);
    setStations([]);
    const fallback: Img[] = [
      { provider: "skin", url: `/skins/${skin.id}/bg1.jpg`, source: "Star Typing", title: skin.id },
    ];
    try {
      const r = await fetch(`/api/slideshow/images?skin=${encodeURIComponent(skin.id)}&provider=${provider}`);
      const j = r.ok ? await r.json() : null;
      setImgs(j?.items?.length ? j.items : fallback);
    } catch {
      setImgs(fallback);
    }
    void loadStations();
  }, [skin.id, provider, loadStations]);

  const close = useCallback(() => {
    setOpen(false);
    last.current = Date.now();
    stopFade();
    setStations([]);
    if (startedRadio.current) {
      const r = useRadio.getState();
      if (after === "stop") r.stop();
      else if (r.audio) r.audio.volume = r.volume;
      startedRadio.current = false;
    }
  }, [after]);

  const switchStation = useCallback(
    (delta: number) => {
      const list = stationsRef.current;
      if (!list.length) return;
      const next = (stIRef.current + delta + list.length) % list.length;
      setStI(next);
      stIRef.current = next;
      playStation(list[next]!, false);
    },
    [playStation],
  );

  const changeVolume = useCallback((delta: number) => {
    if (!startedRadio.current && !useRadio.getState().playing) return;
    stopFade();
    const next = Math.max(0, Math.min(1, volTargetRef.current + delta));
    setVolTarget(next);
    volTargetRef.current = next;
    setMuted(false);
    mutedRef.current = false;
    const a = useRadio.getState().audio;
    if (a) a.volume = next;
  }, []);

  const toggleMute = useCallback(() => {
    if (!startedRadio.current && !useRadio.getState().playing) return;
    stopFade();
    const next = !mutedRef.current;
    setMuted(next);
    mutedRef.current = next;
    const a = useRadio.getState().audio;
    if (a) a.volume = next ? 0 : volTargetRef.current;
  }, []);

  /* таймер простоя + «Показать сейчас» */
  useEffect(() => {
    const touch = () => {
      last.current = Date.now();
    };
    window.addEventListener("keydown", touch, true);
    window.addEventListener("pointerdown", touch, true);
    const id = window.setInterval(() => {
      if (!open && isIdle(last.current, Date.now(), minutes) && document.visibilityState === "visible") {
        void openShow();
      }
    }, 5000);
    const manual = () => void openShow();
    window.addEventListener(IDLE_OPEN_EVENT, manual);
    return () => {
      window.removeEventListener("keydown", touch, true);
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener(IDLE_OPEN_EVENT, manual);
      window.clearInterval(id);
    };
  }, [open, minutes, openShow]);

  /* стрелки = радио; остальное / клик = выход (capture — раньше набора) */
  useEffect(() => {
    if (!open) return;
    let swallowed = "";
    const onDown = (e: KeyboardEvent) => {
      const k = e.key;
      const hasRadio = stationsRef.current.length > 0;
      if (hasRadio && (k === "ArrowLeft" || k === "ArrowRight")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchStation(k === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (hasRadio && (k === "ArrowUp" || k === "ArrowDown")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        changeVolume(k === "ArrowUp" ? VOL_STEP : -VOL_STEP);
        return;
      }
      if (hasRadio && (k === "m" || k === "M" || k === "ь" || k === "Ь")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleMute();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowed = e.code || e.key;
      close();
    };
    window.addEventListener("keydown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      const eat = (e: KeyboardEvent) => {
        if ((e.code || e.key) === swallowed) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (e.type === "keyup") {
          window.removeEventListener("keypress", eat, true);
          window.removeEventListener("keyup", eat, true);
        }
      };
      if (swallowed) {
        window.addEventListener("keypress", eat, true);
        window.addEventListener("keyup", eat, true);
      }
    };
  }, [open, close, switchStation, changeVolume, toggleMute]);

  /* автосмена слайдов */
  useEffect(() => {
    if (!open || imgs.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % imgs.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [open, imgs.length]);

  useEffect(() => {
    const cur = imgs[idx];
    if (open && cur?.provider === "unsplash" && cur.download_location) {
      void fetch(`/api/slideshow/unsplash/track?download_location=${encodeURIComponent(cur.download_location)}`, {
        method: "POST",
      }).catch(() => {});
    }
  }, [open, idx, imgs]);

  if (!open) return null;
  const cur = imgs[idx];
  const name = typeof skin.name === "string" ? skin.name : skin.name?.ru || skin.id;
  const st = stations[stI];
  const volLabel = muted ? ti("muted") : `${Math.round(volTarget * 100)}%`;

  return createPortal(
    <div
      className="idle-show"
      role="dialog"
      aria-modal="true"
      aria-label={ti("title")}
      onClick={close}
      data-skin-show={skin.id}
    >
      {imgs.map((im, i) => (
        <div
          key={im.url + i}
          className={`idle-slide ${i === idx ? "on" : ""}`}
          style={{ backgroundImage: i === idx || i === (idx + 1) % imgs.length ? `url("${im.url}")` : undefined }}
        />
      ))}
      <div className="idle-vignette" />
      <div className="idle-top">
        <span className="idle-skin">{name}</span>
        <span className="idle-hint">{stations.length ? ti("hint_arrows") : ti("hint")}</span>
      </div>
      {st ? (
        <div className="idle-plate" onClick={(e) => e.stopPropagation()}>
          <div className="idle-plate-name">
            ♪ {st.name}
            {stationGenre(st) ? `  ·  ${stationGenre(st)}` : ""}
          </div>
          <div className="idle-plate-hint">
            {ti("plate_hint")} [{stI + 1}/{stations.length} · {volLabel}]
          </div>
        </div>
      ) : null}
      {cur && (
        <div className="idle-credit">
          {cur.provider === "unsplash" ? (
            <>
              {ti("photo")}{" "}
              <a href={cur.author_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {cur.author}
              </a>{" "}
              on{" "}
              <a href={cur.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                Unsplash
              </a>
            </>
          ) : (
            <>
              {cur.title ? <span className="idle-title">{cur.title.replace(/\.(jpe?g|png)$/i, "")}</span> : null}
              {cur.author ? <> · {cur.author}</> : null}
              {cur.license ? <> · {cur.license}</> : null}
              {cur.source ? (
                <>
                  {" · "}
                  <a href={cur.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {cur.source}
                  </a>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
