/** Синтезированные звуки кабины (Web Audio) — без внешних файлов. */

let ctx: AudioContext | null = null;
let muted = false;

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
}

export function soundsMuted() {
  return muted;
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
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export function playClick() {
  beep(880, 0.04, "square", 0.035);
}

export function playError() {
  beep(180, 0.12, "sawtooth", 0.05);
}

export function playFinish() {
  const c = ac();
  if (!c || muted) return;
  void c.resume();
  [523, 659, 784].forEach((f, i) => {
    window.setTimeout(() => beep(f, 0.15, "triangle", 0.05), i * 90);
  });
}
