import { create } from "zustand";
import type { Station } from "./api";

const FAV_KEY = "st_radio_favs";
const VOL_KEY = "st_radio_vol";
const LAST_KEY = "st_radio_last";
const AUTO_KEY = "st_radio_auto";
const DUCK_TYPE_KEY = "st_radio_duck_type";
const GUEST = "guest";

/** Как desktop radio.json в каталоге активного пилота. Гость — отдельное пространство; чужой не читаем. */
export function radioLsKeys(pilot: string) {
  const p = pilot || GUEST;
  return {
    favs: `${FAV_KEY}:${p}`,
    vol: `${VOL_KEY}:${p}`,
    last: `${LAST_KEY}:${p}`,
    auto: `${AUTO_KEY}:${p}`,
    duck: `${DUCK_TYPE_KEY}:${p}`,
  };
}

export function icyTitleApplies(openUrl: string | null | undefined, fetchedUrl: string): boolean {
  return !!openUrl && openUrl === fetchedUrl;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadFavs(pilot: string): Station[] {
  const namespaced = readJson<Station[]>(radioLsKeys(pilot).favs, []);
  if (namespaced.length) return namespaced;
  if (pilot === GUEST) return readJson<Station[]>(FAV_KEY, []);
  return [];
}

function loadLast(pilot: string): Station | null {
  const n = readJson<Station | null>(radioLsKeys(pilot).last, null);
  if (n) return n;
  if (pilot === GUEST) return readJson<Station | null>(LAST_KEY, null);
  return null;
}

function loadVol(pilot: string): number {
  const n = localStorage.getItem(radioLsKeys(pilot).vol);
  if (n != null) return Number(n);
  if (pilot === GUEST) return Number(localStorage.getItem(VOL_KEY) || "0.7");
  return 0.7;
}

function loadDuck(pilot: string): boolean {
  const n = localStorage.getItem(radioLsKeys(pilot).duck);
  if (n != null) return n === "1";
  if (pilot === GUEST) return localStorage.getItem(DUCK_TYPE_KEY) === "1";
  return false;
}

function loadAuto(pilot: string): boolean {
  const n = localStorage.getItem(radioLsKeys(pilot).auto);
  if (n != null) return n !== "0";
  if (pilot === GUEST) return localStorage.getItem(AUTO_KEY) !== "0";
  return true;
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
  pilotId: string;
  setAudio: (el: HTMLAudioElement | null) => void;
  bindPilot: (id: string) => Promise<void>;
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
    if (!icyTitleApplies(get().station?.url_resolved, s.url_resolved)) return;
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
  station: hasLS ? loadLast(GUEST) : null,
  playing: false,
  volume: hasLS ? loadVol(GUEST) : 0.7,
  duck: false,
  duckHolders: [],
  muteHolders: [],
  muted: false,
  duckOnType: hasLS ? loadDuck(GUEST) : false,
  autoLast: hasLS ? loadAuto(GUEST) : true,
  favs: hasLS ? loadFavs(GUEST) : [],
  nowPlaying: null,
  history: [],
  audio: null,
  pilotId: GUEST,

  bindPilot: async (id) => {
    const next = id.trim() || GUEST;
    if (get().pilotId !== next) {
      get().pause();
      set({
        pilotId: next,
        favs: hasLS ? loadFavs(next) : [],
        volume: hasLS ? loadVol(next) : 0.7,
        station: hasLS ? loadLast(next) : null,
        playing: false,
        duckOnType: hasLS ? loadDuck(next) : false,
        autoLast: hasLS ? loadAuto(next) : true,
        nowPlaying: null,
        history: [],
      });
      applyAudioVolume(get);
    }
    await get().syncFavsFromServer();
  },

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
      localStorage.setItem(radioLsKeys(get().pilotId).last, JSON.stringify(s));
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
    localStorage.setItem(radioLsKeys(get().pilotId).vol, String(vol));
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
    localStorage.setItem(radioLsKeys(get().pilotId).duck, v ? "1" : "0");
    set({ duckOnType: v });
  },

  setAutoLast: (v) => {
    localStorage.setItem(radioLsKeys(get().pilotId).auto, v ? "1" : "0");
    set({ autoLast: v });
  },

  toggleFav: (s) => {
    const id = stationId(s);
    const cur = get().favs;
    const next = cur.some((x) => stationId(x) === id)
      ? cur.filter((x) => stationId(x) !== id)
      : [...cur, s];
    localStorage.setItem(radioLsKeys(get().pilotId).favs, JSON.stringify(next));
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
    const last = loadLast(get().pilotId);
    if (!last || get().playing) return;
    if (!get().audio) return;
    get().play(last);
  },

  syncFavsFromServer: async () => {
    try {
      const r = await fetch("/api/radio/favs", { credentials: "include" });
      if (!r.ok) return;
      const remote = (await r.json()) as Station[];
      if (!Array.isArray(remote)) return;
      const loggedIn = get().pilotId !== GUEST;
      if (!loggedIn) return;
      localStorage.setItem(radioLsKeys(get().pilotId).favs, JSON.stringify(remote));
      set({ favs: remote });
    } catch {
      /* offline */
    }
  },
}));
