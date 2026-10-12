/** Звуки кабины: сэмплы из /sounds/* с fallback на Web Audio synth + микшер. */

let ctx: AudioContext | null = null;
let muted = false;
let fxVolume = Number(localStorage.getItem("st_fx_vol") ?? "0.7");
let bank = localStorage.getItem("st_fx_bank") || "default";
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
  localStorage.setItem("st_fx_mute", v ? "1" : "0");
}

export function soundsMuted() {
  return muted;
}

export function setFxVolume(v: number) {
  fxVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem("st_fx_vol", String(fxVolume));
}

export function getFxVolume() {
  return fxVolume;
}

export function setFxBank(b: string) {
  bank = b;
  localStorage.setItem("st_fx_bank", b);
  buffers.clear();
  tried.clear();
}

export function getFxBank() {
  return bank;
}

export function applyQuietMode() {
  if (typeof window === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce || localStorage.getItem("st_quiet") === "1") {
    muted = true;
  }
}

if (typeof window !== "undefined") {
  muted = localStorage.getItem("st_fx_mute") === "1";
  applyQuietMode();
}

async function loadSample(name: string): Promise<AudioBuffer | null> {
  const key = `${bank}:${name}`;
  if (buffers.has(key)) return buffers.get(key)!;
  if (tried.has(key)) return null;
  tried.add(key);
  const c = ac();
  if (!c) return null;
  const names = bank === "alt" && name === "click" ? ["click_alt", "click"] : [name];
  for (const n of names) {
    for (const ext of ["ogg", "mp3", "wav"]) {
      try {
        const r = await fetch(`/sounds/${n}.${ext}`);
        if (!r.ok) continue;
        const buf = await c.decodeAudioData(await r.arrayBuffer());
        buffers.set(key, buf);
        return buf;
      } catch {
        /* next */
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
