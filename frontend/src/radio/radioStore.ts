import { create } from "zustand";
import type { Station } from "./api";

const FAV_KEY = "st_radio_favs";
const VOL_KEY = "st_radio_vol";

function loadFavs(): Station[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]") as Station[];
  } catch {
    return [];
  }
}

type RadioState = {
  station: Station | null;
  playing: boolean;
  volume: number;
  duck: boolean;
  favs: Station[];
  audio: HTMLAudioElement | null;
  setAudio: (el: HTMLAudioElement | null) => void;
  play: (s: Station) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  setDuck: (v: boolean) => void;
  toggleFav: (s: Station) => void;
  isFav: (s: Station) => boolean;
};

function applyMediaSession(s: Station | null, actions: { play: () => void; pause: () => void }) {
  if (!("mediaSession" in navigator) || !s) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: s.name,
    artist: "Star Typing Radio",
    album: s.country || "Uplink",
    artwork: s.favicon ? [{ src: s.favicon, sizes: "96x96", type: "image/png" }] : [],
  });
  navigator.mediaSession.setActionHandler("play", actions.play);
  navigator.mediaSession.setActionHandler("pause", actions.pause);
  navigator.mediaSession.playbackState = "playing";
}

export const useRadio = create<RadioState>((set, get) => ({
  station: null,
  playing: false,
  volume: Number(localStorage.getItem(VOL_KEY) || "0.7"),
  duck: false,
  favs: typeof localStorage !== "undefined" ? loadFavs() : [],
  audio: null,

  setAudio: (el) => {
    if (el) el.volume = get().volume;
    set({ audio: el });
  },

  play: (s) => {
    const a = get().audio;
    if (!a) return;
    a.src = s.url_resolved;
    a.volume = get().duck ? get().volume * 0.15 : get().volume;
    void a.play().then(() => {
      set({ station: s, playing: true });
      applyMediaSession(s, {
        play: () => get().resume(),
        pause: () => get().pause(),
      });
    });
  },

  pause: () => {
    get().audio?.pause();
    set({ playing: false });
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  },

  resume: () => {
    const a = get().audio;
    if (!a?.src) return;
    void a.play().then(() => {
      set({ playing: true });
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    });
  },

  toggle: () => {
    if (get().playing) get().pause();
    else get().resume();
  },

  setVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v));
    localStorage.setItem(VOL_KEY, String(vol));
    const a = get().audio;
    if (a) a.volume = get().duck ? vol * 0.15 : vol;
    set({ volume: vol });
  },

  setDuck: (duck) => {
    const a = get().audio;
    if (a) a.volume = duck ? get().volume * 0.15 : get().volume;
    set({ duck });
  },

  toggleFav: (s) => {
    const id = s.stationuuid || s.url_resolved;
    const cur = get().favs;
    const next = cur.some((x) => (x.stationuuid || x.url_resolved) === id)
      ? cur.filter((x) => (x.stationuuid || x.url_resolved) !== id)
      : [...cur, s];
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
    set({ favs: next });
  },

  isFav: (s) => {
    const id = s.stationuuid || s.url_resolved;
    return get().favs.some((x) => (x.stationuuid || x.url_resolved) === id);
  },
}));
