/**
 * Серверный ASR: браузер пишет PCM → WAV → POST /api/english/asr (Vosk + score_sentence).
 * VU и тишина — локально; распознавание — на бэкенде (как десктоп).
 */

export type ServerAsrResult = {
  transcript: string;
  alternatives: string[];
  score: number;
  marks: [string, boolean][];
  engine: "vosk-server" | "none";
  error?: string;
  peakRms?: number;
};

export type ServerListenOpts = {
  /** "word" — сервер считает score_word (как десктоп для слова карточки) */
  mode?: "sentence" | "word";
  wordId?: number;
  expected: string;
  targetWord?: string;
  onInterim?: (text: string) => void;
  onLevel?: (rms: number) => void;
  onSounding?: (on: boolean) => void;
  onStarted?: () => void;
  onProcessing?: () => void;
  onReadyStop?: (stop: () => void) => void;
  maxMs?: number;
  waitStartMs?: number;
  silenceMs?: number;
};

const DEFAULT_MAX_MS = 15000;
const WAIT_START_MS = 2000;
const SILENCE_AFTER_MS = 1200;
const SPEAKING_RMS = 0.01;
const SILENT_PEAK = 0.004;
const TARGET_RATE = 16000;

let statusCache: { ok: boolean; at: number } | null = null;

export async function serverAsrAvailable(): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < 30_000) {
    return { ok: statusCache.ok };
  }
  try {
    const r = await fetch("/api/english/asr/status", { credentials: "include" });
    const j = (await r.json()) as { ok?: boolean; reason?: string };
    statusCache = { ok: Boolean(j.ok), at: now };
    return { ok: Boolean(j.ok), reason: j.reason };
  } catch {
    statusCache = { ok: false, at: now };
    return { ok: false, reason: "network" };
  }
}

function empty(error?: string, peakRms = 0): ServerAsrResult {
  return {
    transcript: "",
    alternatives: [],
    score: 0,
    marks: [],
    engine: "none",
    error,
    peakRms,
  };
}

/** int16 LE WAV mono */
function encodeWav(pcm: Int16Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++, o += 2) view.setInt16(o, pcm[i]!, true);
  return new Blob([buf], { type: "audio/wav" });
}

function downsampleTo16k(input: Float32Array, srcRate: number): Int16Array {
  if (srcRate === TARGET_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = srcRate / TARGET_RATE;
  const nOut = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(nOut);
  for (let i = 0; i < nOut; i++) {
    const srcI = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, input[srcI] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function listenOnceServer(opts: ServerListenOpts): Promise<ServerAsrResult> {
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const waitStartMs = opts.waitStartMs ?? WAIT_START_MS;
  const silenceMs = opts.silenceMs ?? SILENCE_AFTER_MS;

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    return empty("mic-denied");
  }

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const inputRate = ctx.sampleRate || 48000;
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // mute graph — иначе AEC глушит речь, а VU всё равно двигается
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(analyser);
  analyser.connect(mute);
  mute.connect(ctx.destination);

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let peakRms = 0;
  let spoken = false;
  let lastLoudAt = 0;
  let stopped = false;
  let resolveStop: (() => void) | null = null;
  const stopPromise = new Promise<void>((r) => {
    resolveStop = r;
  });

  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    resolveStop?.();
  };

  opts.onReadyStop?.(stopAll);
  opts.onStarted?.();

  const t0 = performance.now();
  processor.onaudioprocess = (ev) => {
    if (stopped) return;
    const input = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i += 4) sum += input[i]! * input[i]!;
    const rms = Math.sqrt(sum / Math.max(1, Math.floor(input.length / 4)));
    peakRms = Math.max(peakRms, rms);
    opts.onLevel?.(rms);
    const now = performance.now();
    if (rms >= SPEAKING_RMS) {
      spoken = true;
      lastLoudAt = now;
      opts.onSounding?.(true);
    }
    const elapsed = now - t0;
    if (elapsed >= maxMs) {
      stopAll();
      return;
    }
    if (spoken && elapsed >= waitStartMs && lastLoudAt > 0 && now - lastLoudAt >= silenceMs) {
      stopAll();
    }
  };

  // ScriptProcessor must be connected to run
  const silent = ctx.createGain();
  silent.gain.value = 0;
  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  // auto max timeout backup
  const timer = window.setTimeout(stopAll, maxMs + 50);
  await stopPromise;
  window.clearTimeout(timer);

  opts.onProcessing?.();

  processor.disconnect();
  silent.disconnect();
  analyser.disconnect();
  mute.disconnect();
  source.disconnect();
  stream.getTracks().forEach((tr) => tr.stop());
  await ctx.close().catch(() => undefined);

  if (peakRms < SILENT_PEAK && !spoken) {
    return empty("silent", peakRms);
  }

  // merge float chunks → int16 @ 16k
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const pcm = downsampleTo16k(merged, inputRate);
  if (pcm.length < TARGET_RATE * 0.3) {
    return empty("empty", peakRms);
  }
  const wav = encodeWav(pcm, TARGET_RATE);

  const fd = new FormData();
  fd.append("audio", wav, "utterance.wav");
  fd.append("expected", opts.expected);
  fd.append("target_word", opts.targetWord || "");
  fd.append("mode", opts.mode || "sentence");
  fd.append("word_id", String(opts.wordId || 0));

  try {
    const r = await fetch("/api/english/asr", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return empty(r.status === 503 ? "no-asr" : `http-${r.status}:${detail.slice(0, 80)}`, peakRms);
    }
    const j = (await r.json()) as {
      transcript?: string;
      alternatives?: string[];
      score?: number;
      marks?: { word: string; ok: boolean }[];
      error?: string | null;
    };
    const marks: [string, boolean][] = (j.marks || []).map((m) => [m.word, m.ok]);
    const transcript = (j.transcript || "").trim();
    if (!transcript) {
      return {
        ...empty(j.error || "no-words", peakRms),
        alternatives: j.alternatives || [],
        engine: "vosk-server",
      };
    }
    opts.onInterim?.(transcript);
    return {
      transcript,
      alternatives: j.alternatives || [transcript],
      score: Math.round(j.score ?? 0),
      marks,
      engine: "vosk-server",
      peakRms,
    };
  } catch {
    return empty("network", peakRms);
  }
}
