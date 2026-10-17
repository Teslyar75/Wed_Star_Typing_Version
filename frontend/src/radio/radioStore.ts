import { create } from "zustand";
import type { Station } from "./api";

const FAV_KEY = "st_radio_favs";
const VOL_KEY = "st_radio_vol";
const LAST_KEY = "st_radio_last";
const AUTO_KEY = "st_radio_auto";
const DUCK_TYPE_KEY = "st_radio_duck_type";

function loadFavs(): Station[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]") as Station[];
  } catch {
    return [];
  }
}

function loadLast(): Station | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "null") as Station | null;
  } catch {
    return null;
  }
}

function stationId(s: Station) {
  return s.stationuuid || s.url_resolved;
}

type RadioState = {
  station: Station | null;
  playing: boolean;
  volume: number;
  duck: boolean;
  /** кто держит приглушение (набор / гид) — снятие одного не срывает другое */
  duckHolders: string[];
  /** полная тишина (вызов Ориона / микрофон) — приоритетнее duck */
  muteHolders: string[];
  muted: boolean;
  duckOnType: boolean;
  autoLast: boolean;
  favs: Station[];
  nowPlaying: string | null;
  history: string[];
  audio: HTMLAudioElement | null;
  setAudio: (el: HTMLAudioElement | null) => void;
  play: (s: Station) => void;
  pause: () => void;
  stop: () => void;
  resume: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  setDuck: (v: boolean) => void;
  /** приглушить радио (reason: type | guide | …) */
  holdDuck: (reason: string) => void;
  releaseDuck: (reason: string) => void;
  /** полностью заглушить (вызов Ориона — чтобы услышать пилота) */
  holdMute: (reason: string) => void;
  releaseMute: (reason: string) => void;
  setDuckOnType: (v: boolean) => void;
  setAutoLast: (v: boolean) => void;
  toggleFav: (s: Station) => void;
  isFav: (s: Station) => boolean;
  nextFav: () => void;
  prevFav: () => void;
  setNowPlaying: (title: string | null) => void;
  pushHistory: (title: string) => void;
  tryAutoplayLast: () => void;
  syncFavsFromServer: () => Promise<void>;
};

let icyTimer: ReturnType<typeof setInterval> | null = null;

function applyMediaSession(
  s: Station | null,
  track: string | null,
  actions: { play: () => void; pause: () => void; next?: () => void; prev?: () => void },
) {
  if (!("mediaSession" in navigator) || !s) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track || s.name,
    artist: s.name,
    album: s.country || "Uplink",
    artwork: s.favicon ? [{ src: s.favicon, sizes: "96x96", type: "image/png" }] : [],
  });
  navigator.mediaSession.setActionHandler("play", actions.play);
  navigator.mediaSession.setActionHandler("pause", actions.pause);
  navigator.mediaSession.setActionHandler("nexttrack", actions.next ?? null);
  navigator.mediaSession.setActionHandler("previoustrack", actions.prev ?? null);
  navigator.mediaSession.playbackState = "playing";
}

async function pollIcy(get: () => RadioState) {
  const s = get().station;
  if (!s || !get().playing) return;
  try {
    const r = await fetch(`/api/radio/nowplaying?url=${encodeURIComponent(s.url_resolved)}`);
    if (!r.ok) return;
    const j = (await r.json()) as { title?: string | null };
    const title = (j.title || "").trim();
    if (!title) return;
    if (title !== get().nowPlaying) {
      get().setNowPlaying(title);
      get().pushHistory(title);
      applyMediaSession(s, title, {
        play: () => get().resume(),
        pause: () => get().pause(),
        next: () => get().nextFav(),
        prev: () => get().prevFav(),
      });
    }
  } catch {
    /* offline */
  }
}

function startIcyPoll(get: () => RadioState) {
  stopIcyPoll();
  void pollIcy(get);
  icyTimer = setInterval(() => void pollIcy(get), 12_000);
}

function stopIcyPoll() {
  if (icyTimer) {
    clearInterval(icyTimer);
    icyTimer = null;
  }
}

function favIndex(get: () => RadioState): number {
  const s = get().station;
  if (!s) return -1;
  const id = stationId(s);
  return get().favs.findIndex((x) => stationId(x) === id);
}

const hasLS = typeof localStorage !== "undefined";
const DUCK_LEVEL = 0.15;

function applyAudioVolume(get: () => RadioState) {
  const a = get().audio;
  if (!a) return;
  if (get().muted || get().muteHolders.length) a.volume = 0;
  else if (get().duck) a.volume = get().volume * DUCK_LEVEL;
  else a.volume = get().volume;
}

export const useRadio = create<RadioState>((set, get) => ({
  station: hasLS ? loadLast() : null,
  playing: false,
  volume: hasLS ? Number(localStorage.getItem(VOL_KEY) || "0.7") : 0.7,
  duck: false,
  duckHolders: [],
  muteHolders: [],
  muted: false,
  duckOnType: hasLS ? localStorage.getItem(DUCK_TYPE_KEY) === "1" : false,
  autoLast: hasLS ? localStorage.getItem(AUTO_KEY) !== "0" : true,
  favs: hasLS ? loadFavs() : [],
  nowPlaying: null,
  history: [],
  audio: null,

  setAudio: (el) => {
    /* не затираем живой элемент null-ом при смене вкладок */
    if (!el && get().audio) return;
    set({ audio: el });
    if (el) applyAudioVolume(get);
  },

  play: (s) => {
    const a = get().audio;
    if (!a) return;
    a.src = s.url_resolved;
    applyAudioVolume(get);
    void a.play().then(() => {
      localStorage.setItem(LAST_KEY, JSON.stringify(s));
      set({ station: s, playing: true, nowPlaying: null });
      applyMediaSession(s, null, {
        play: () => get().resume(),
        pause: () => get().pause(),
        next: () => get().nextFav(),
        prev: () => get().prevFav(),
      });
      startIcyPoll(get);
    }).catch(() => {
      /* прервано pause()/stop() или автоплей запрещён */
    });
  },

  pause: () => {
    get().audio?.pause();
    set({ playing: false });
    stopIcyPoll();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  },

  stop: () => {
    const a = get().audio;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    set({ playing: false, station: null, nowPlaying: null });
    stopIcyPoll();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  },

  resume: () => {
    const a = get().audio;
    const s = get().station;
    if (!a) return;
    if (!a.src && s) {
      get().play(s);
      return;
    }
    if (!a.src) return;
    void a.play().then(() => {
      set({ playing: true });
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      startIcyPoll(get);
    });
  },

  toggle: () => {
    if (get().playing) get().pause();
    else get().resume();
  },

  setVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v));
    localStorage.setItem(VOL_KEY, String(vol));
    set({ volume: vol });
    applyAudioVolume(get);
  },

  setDuck: (duck) => {
    /* совместимость: набор / старый API → reason "type" */
    if (duck) get().holdDuck("type");
    else get().releaseDuck("type");
  },

  holdDuck: (reason) => {
    const holders = get().duckHolders;
    if (holders.includes(reason)) {
      applyAudioVolume(get);
      return;
    }
    const next = [...holders, reason];
    set({ duckHolders: next, duck: true });
    applyAudioVolume(get);
  },

  releaseDuck: (reason) => {
    const next = get().duckHolders.filter((r) => r !== reason);
    set({ duckHolders: next, duck: next.length > 0 });
    applyAudioVolume(get);
  },

  holdMute: (reason) => {
    const holders = get().muteHolders;
    if (holders.includes(reason)) {
      applyAudioVolume(get);
      return;
    }
    const next = [...holders, reason];
    set({ muteHolders: next, muted: true });
    applyAudioVolume(get);
  },

  releaseMute: (reason) => {
    const next = get().muteHolders.filter((r) => r !== reason);
    set({ muteHolders: next, muted: next.length > 0 });
    applyAudioVolume(get);
  },

  setDuckOnType: (v) => {
    localStorage.setItem(DUCK_TYPE_KEY, v ? "1" : "0");
    set({ duckOnType: v });
  },

  setAutoLast: (v) => {
    localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    set({ autoLast: v });
  },

  toggleFav: (s) => {
    const id = stationId(s);
    const cur = get().favs;
    const next = cur.some((x) => stationId(x) === id)
      ? cur.filter((x) => stationId(x) !== id)
      : [...cur, s];
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
    set({ favs: next });
    void fetch("/api/radio/favs", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        next.map((x) => ({
          stationuuid: x.stationuuid || "",
          name: x.name,
          url_resolved: x.url_resolved,
          country: x.country || "",
          favicon: x.favicon || "",
          tags: x.tags || "",
          language: x.language || "",
        })),
      ),
    }).catch(() => undefined);
  },

  isFav: (s) => {
    const id = stationId(s);
    return get().favs.some((x) => stationId(x) === id);
  },

  nextFav: () => {
    const favs = get().favs;
    if (!favs.length) return;
    const i = favIndex(get);
    const next = favs[(i + 1) % favs.length]!;
    get().play(next);
  },

  prevFav: () => {
    const favs = get().favs;
    if (!favs.length) return;
    const i = favIndex(get);
    const prev = favs[(i <= 0 ? favs.length : i) - 1]!;
    get().play(prev);
  },

  setNowPlaying: (title) => set({ nowPlaying: title }),

  pushHistory: (title) => {
    const h = get().history;
    if (h[0] === title) return;
    set({ history: [title, ...h].slice(0, 12) });
  },

  tryAutoplayLast: () => {
    if (!get().autoLast) return;
    const last = loadLast();
    if (!last || get().playing) return;
    if (!get().audio) return;
    get().play(last);
  },

  syncFavsFromServer: async () => {
    try {
      const r = await fetch("/api/radio/favs", { credentials: "include" });
      if (!r.ok) return;
      const remote = (await r.json()) as Station[];
      if (!Array.isArray(remote) || !remote.length) return;
      localStorage.setItem(FAV_KEY, JSON.stringify(remote));
      set({ favs: remote });
    } catch {
      /* offline */
    }
  },
}));
