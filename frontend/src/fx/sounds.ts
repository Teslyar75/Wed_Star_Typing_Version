/** Звуки кабины: сэмплы из /sounds/* с fallback на Web Audio synth. */

let ctx: AudioContext | null = null;
let muted = false;
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
}

export function soundsMuted() {
  return muted;
}

async function loadSample(name: string): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name)!;
  if (tried.has(name)) return null;
  tried.add(name);
  const c = ac();
  if (!c) return null;
  for (const ext of ["ogg", "mp3", "wav"]) {
    try {
      const r = await fetch(`/sounds/${name}.${ext}`);
      if (!r.ok) continue;
      const buf = await c.decodeAudioData(await r.arrayBuffer());
      buffers.set(name, buf);
      return buf;
    } catch {
      /* next ext / synth */
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
  g.gain.value = gain;
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
  g.gain.value = gain;
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
