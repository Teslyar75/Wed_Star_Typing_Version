/** Звуки кабины: per-skin сэмплы + fallback /sounds/* + synth. */

import type { SkinSounds } from "../theme/applyTheme";

function lsGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem?.(key, value);
  } catch {
    /* jsdom / node without storage */
  }
}

let ctx: AudioContext | null = null;
let muted = false;
let fxVolume = Number(lsGet("st_fx_vol") ?? "0.7");
let bank = lsGet("st_fx_bank") || "default";
let skinSounds: SkinSounds | null = null;
const buffers = new Map<string, AudioBuffer>();
const tried = new Set<string>();

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function setSoundsMuted(v: boolean) {
  muted = v;
  lsSet("st_fx_mute", v ? "1" : "0");
}

export function soundsMuted() {
  return muted;
}

export function setFxVolume(v: number) {
  fxVolume = Math.max(0, Math.min(1, v));
  lsSet("st_fx_vol", String(fxVolume));
}

export function getFxVolume() {
  return fxVolume;
}

export function setFxBank(b: string) {
  bank = b;
  lsSet("st_fx_bank", b);
  buffers.clear();
  tried.clear();
}

export function getFxBank() {
  return bank;
}

/** Пути из theme.sounds (абсолютные URL вроде /sounds/skins/…). */
export function setSkinSounds(s: SkinSounds | null) {
  skinSounds = s;
  buffers.clear();
  tried.clear();
}

export function applyQuietMode() {
  if (typeof window === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce || lsGet("st_quiet") === "1") {
    muted = true;
  }
}

if (typeof window !== "undefined") {
  muted = lsGet("st_fx_mute") === "1";
  applyQuietMode();
}

function skinUrl(name: string): string | null {
  if (!skinSounds) return null;
  if (name === "click") return skinSounds.click || null;
  if (name === "error") return skinSounds.error || null;
  if (name === "finish") return skinSounds.finish || skinSounds.ok || skinSounds.bell || null;
  if (name === "start") return skinSounds.start || null;
  return null;
}

async function decodeUrl(url: string): Promise<AudioBuffer | null> {
  const c = ac();
  if (!c) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await c.decodeAudioData(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadSample(name: string): Promise<AudioBuffer | null> {
  const key = `${bank}:${skinSounds?.click || ""}:${name}`;
  if (buffers.has(key)) return buffers.get(key)!;
  if (tried.has(key)) return null;
  tried.add(key);
  const c = ac();
  if (!c) return null;

  const preferred = skinUrl(name);
  if (preferred) {
    const buf = await decodeUrl(preferred);
    if (buf) {
      buffers.set(key, buf);
      return buf;
    }
  }

  const names = bank === "alt" && name === "click" ? ["click_alt", "click"] : [name];
  for (const n of names) {
    for (const ext of ["ogg", "mp3", "wav"]) {
      const buf = await decodeUrl(`/sounds/${n}.${ext}`);
      if (buf) {
        buffers.set(key, buf);
        return buf;
      }
    }
  }
  return null;
}

function playBuffer(buf: AudioBuffer, gain = 0.4) {
  const c = ac();
  if (!c || muted) return;
  void c.resume();
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.value = gain * fxVolume;
  src.connect(g);
  g.connect(c.destination);
  src.start();
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.05) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  void c.resume();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain * fxVolume;
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

async function playNamed(name: string, synth: () => void) {
  if (muted) return;
  const buf = await loadSample(name);
  if (buf) playBuffer(buf);
  else synth();
}

export function playClick() {
  void playNamed("click", () => beep(880, 0.04, "square", 0.035));
}

export function playError() {
  void playNamed("error", () => beep(180, 0.12, "sawtooth", 0.05));
}

export function playFinish() {
  void playNamed("finish", () => {
    const c = ac();
    if (!c || muted) return;
    void c.resume();
    [523, 659, 784].forEach((f, i) => {
      window.setTimeout(() => beep(f, 0.15, "triangle", 0.05), i * 90);
    });
  });
}

export function playStart() {
  void playNamed("start", () => beep(440, 0.08, "sine", 0.04));
}
