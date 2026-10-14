/**
 * ASR: Vosk (vosk-browser README) + Web Speech fallback.
 *
 * Тайминг:
 *  — минимум waitStartMs (2 с) от старта, тишина в начале НЕ стопит;
 *  — после речи: silenceMs тишины → стоп;
 *  — или ручной stop() / maxMs.
 */
import { scoreSentence } from "./textutil";
import { resolveVoskModelUrl, voskCachedOrRemote } from "./voskCache";

export type AsrResult = {
  transcript: string;
  alternatives: string[];
  score: number;
  engine: "webspeech" | "vosk" | "none";
  marks: [string, boolean][];
  error?: string;
  peakRms?: number;
};

export type ListenOpts = {
  expected: string;
  targetWord?: string;
  lang?: string;
  onInterim?: (text: string) => void;
  onLevel?: (rms: number) => void;
  onSounding?: (on: boolean) => void;
  onStarted?: () => void;
  onProcessing?: () => void;
  /** вызвать stop() — пользователь нажал «Стоп» */
  onReadyStop?: (stop: () => void) => void;
  maxMs?: number;
  /** не стопить по тишине раньше (по умолчанию 2000) */
  waitStartMs?: number;
  silenceMs?: number;
};

const DEFAULT_MAX_MS = 15000;
const WAIT_START_MS = 2000;
const SILENCE_AFTER_MS = 1200;
const SPEAKING_RMS = 0.01;
const SILENT_PEAK = 0.004;

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean; length: number }>;
  }) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
};

function emptyResult(engine: AsrResult["engine"] = "none", error?: string, peakRms = 0): AsrResult {
  return { transcript: "", alternatives: [], score: 0, engine, marks: [], error, peakRms };
}

export function scoreBest(
  expected: string,
  alternatives: string[],
  targetWord?: string,
): { score: number; marks: [string, boolean][]; heard: string } {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean);
  if (!alts.length) return { score: 0, marks: [], heard: "" };
  let best = { score: -1, marks: [] as [string, boolean][], heard: "" };
  for (const a of alts) {
    const { score, marks } = scoreSentence(expected, a, targetWord);
    if (score > best.score) best = { score, marks, heard: a };
  }
  return best;
}

function packAlts(
  expected: string,
  alternatives: string[],
  engine: AsrResult["engine"],
  targetWord?: string,
  error?: string,
  peakRms?: number,
): AsrResult {
  const { score, marks, heard } = scoreBest(expected, alternatives, targetWord);
  return {
    transcript: heard,
    alternatives: alternatives.map((a) => a.trim()).filter(Boolean),
    score,
    marks,
    engine,
    error,
    peakRms,
  };
}

function modelUrl(): string {
  return (
    (import.meta as { env?: { VITE_VOSK_MODEL_URL?: string } }).env?.VITE_VOSK_MODEL_URL ||
    "/models/vosk-model-small-en-us.tar.gz"
  );
}

function getSpeechRecognition(): (new () => SR) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export async function voskModelAvailable(): Promise<boolean> {
  return voskCachedOrRemote(modelUrl());
}

export async function asrAvailable(): Promise<{ ok: boolean; engine: "vosk" | "webspeech" | "none"; why?: string }> {
  if (await voskModelAvailable()) return { ok: true, engine: "vosk" };
  if (getSpeechRecognition()) return { ok: true, engine: "webspeech" };
  return { ok: false, engine: "none", why: "no-asr" };
}

type VoskRecognizer = {
  on: (
    ev: string,
    fn: (msg: { result: { text?: string; partial?: string; alternatives?: { text?: string }[] } }) => void,
  ) => void;
  acceptWaveform: (buf: AudioBuffer) => void;
  remove: () => void;
};

type VoskModel = {
  KaldiRecognizer: new (sampleRate: number) => VoskRecognizer;
};

let modelPromise: Promise<VoskModel> | null = null;
let modelReady = false;

async function getVoskModel(): Promise<VoskModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { createModel } = await import("vosk-browser");
      const objectUrl = await resolveVoskModelUrl(modelUrl());
      const m = (await createModel(objectUrl)) as unknown as VoskModel;
      modelReady = true;
      return m;
    })().catch((e) => {
      modelPromise = null;
      modelReady = false;
      throw e;
    });
  }
  return modelPromise;
}

export function preloadVosk(): void {
  void voskModelAvailable().then((ok) => {
    if (ok) void getVoskModel().catch(() => undefined);
  });
}

export function isVoskReady(): boolean {
  return modelReady;
}

function bufferRmsF32(data: Float32Array): number {
  let sum = 0;
  const step = Math.max(1, Math.floor(data.length / 256));
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    const v = data[i]!;
    sum += v * v;
    n += 1;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/** Браузерный AudioContext часто 48 kHz — Vosk ждёт 16 kHz. */
function to16kBuffer(ctx: AudioContext, input: AudioBuffer): AudioBuffer {
  const inRate = input.sampleRate;
  const ch = input.getChannelData(0);
  if (Math.abs(inRate - 16000) < 50) {
    // всё равно отдаём копию с явным 16000 — иначе Kaldi путает метку
    if (input.sampleRate === 16000) return input;
  }
  const ratio = inRate / 16000;
  const outLen = Math.max(1, Math.floor(ch.length / ratio));
  const out = ctx.createBuffer(1, outLen, 16000);
  const dst = out.getChannelData(0);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(ch.length - 1, i0 + 1);
    const frac = src - i0;
    dst[i] = ch[i0]! * (1 - frac) + ch[i1]! * frac;
  }
  return out;
}

/**
 * Vosk: acceptWaveform + downsample 16 kHz; ScriptProcessor через mute (gain=0).
 */
export async function listenWithVosk(opts: ListenOpts): Promise<AsrResult> {
  if (!(await voskModelAvailable())) return emptyResult("none", "no-vosk-model");

  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const waitStartMs = opts.waitStartMs ?? WAIT_START_MS;
  const silenceMs = opts.silenceMs ?? SILENCE_AFTER_MS;

  let micStream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  let analyser: AnalyserNode | null = null;
  let recognizer: { remove: () => void } | null = null;
  let srcNode: MediaStreamAudioSourceNode | null = null;
  let raf = 0;

  try {
    const model = await getVoskModel();

    micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 16000,
      },
    });
    // не форсируем 16k у AudioContext — браузер часто игнорирует; ресемплим сами
    ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    opts.onStarted?.();

    const rec = new model.KaldiRecognizer(16000);
    recognizer = rec;

    let alternatives: string[] = [];
    let lastPartial = "";
    let heardText = false;
    let hadLoud = false;
    let peak = 0;
    let stopRequested = false;
    let lastActiveAt = 0;
    const started = performance.now();

    const requestStop = () => {
      stopRequested = true;
    };
    opts.onReadyStop?.(requestStop);

    rec.on("partialresult", (message) => {
      const p = (message.result.partial || "").trim();
      if (p) {
        lastPartial = p;
        heardText = true;
        lastActiveAt = performance.now();
        opts.onInterim?.(p);
        opts.onSounding?.(true);
      }
    });
    rec.on("result", (message) => {
      const text = (message.result.text || "").trim();
      const alts =
        message.result.alternatives?.map((a) => (a.text || "").trim()).filter(Boolean) ||
        (text ? [text] : []);
      if (alts.length) {
        alternatives = alts;
        lastPartial = alts[0] || lastPartial;
        heardText = true;
        lastActiveAt = performance.now();
        opts.onInterim?.(alts[0]!);
        opts.onSounding?.(true);
        stopRequested = true;
      }
    });

    srcNode = ctx.createMediaStreamSource(micStream);

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    srcNode.connect(analyser);
    const vuData = new Float32Array(analyser.fftSize);

    const vuTick = () => {
      if (!analyser || stopRequested) return;
      analyser.getFloatTimeDomainData(vuData);
      const rms = bufferRmsF32(vuData);
      peak = Math.max(peak, rms);
      opts.onLevel?.(rms);

      const now = performance.now();
      const elapsed = now - started;

      if (rms >= SPEAKING_RMS) {
        hadLoud = true;
        lastActiveAt = now;
        opts.onSounding?.(true);
      }

      const canSilenceStop = elapsed >= waitStartMs && (heardText || hadLoud) && lastActiveAt > 0;
      if (canSilenceStop && rms < SPEAKING_RMS && now - lastActiveAt >= silenceMs) {
        stopRequested = true;
      }
      raf = requestAnimationFrame(vuTick);
    };
    vuTick();

    node = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0; // иначе AEC глушит речь → VU есть, текста нет
    node.onaudioprocess = (event) => {
      if (stopRequested) return;
      try {
        rec.acceptWaveform(to16kBuffer(ctx!, event.inputBuffer));
      } catch {
        /* */
      }
    };
    srcNode.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (stopRequested || performance.now() - started >= maxMs) {
          stopRequested = true;
          resolve();
          return;
        }
        window.setTimeout(tick, 40);
      };
      tick();
    });

    // дать воркеру дослать final/partial после СТОП
    await new Promise((r) => window.setTimeout(r, 350));

    opts.onProcessing?.();

    if (!alternatives.length && lastPartial) alternatives = [lastPartial];

    if (!alternatives.length) {
      if (peak < SILENT_PEAK && !hadLoud) return emptyResult("vosk", "silent", peak);
      if (hadLoud || heardText) return emptyResult("vosk", "no-words", peak);
      return emptyResult("vosk", "empty", peak);
    }
    return packAlts(opts.expected, alternatives, "vosk", opts.targetWord, undefined, peak);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "vosk-fail";
    if (/NotAllowed|Permission|NotFound|Denied/i.test(msg)) return emptyResult("none", "mic-denied");
    return emptyResult("none", msg);
  } finally {
    cancelAnimationFrame(raf);
    try {
      recognizer?.remove();
    } catch {
      /* */
    }
    try {
      node?.disconnect();
      analyser?.disconnect();
      srcNode?.disconnect();
    } catch {
      /* */
    }
    micStream?.getTracks().forEach((t) => t.stop());
    if (ctx) void ctx.close();
    opts.onLevel?.(0);
    opts.onSounding?.(false);
  }
}

async function listenWebSpeech(opts: ListenOpts): Promise<AsrResult> {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return emptyResult("none", "no-webspeech");

  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const waitStartMs = opts.waitStartMs ?? WAIT_START_MS;
  const silenceMs = opts.silenceMs ?? SILENCE_AFTER_MS;
  opts.onStarted?.();

  return new Promise((resolve) => {
    let settled = false;
    const alts: string[] = [];
    let interim = "";
    let heardAny = false;
    let lastSpeechAt = 0;
    let wantStop = false;
    let pollTimer: number | null = null;
    let maxTimer: number | null = null;
    let idleTimer: number | null = null;

    const cleanup = () => {
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (maxTimer != null) window.clearTimeout(maxTimer);
      if (idleTimer != null) window.clearInterval(idleTimer);
      opts.onLevel?.(0);
      opts.onSounding?.(false);
    };

    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      wantStop = true;
      try {
        rec.stop();
      } catch {
        /* */
      }
      cleanup();
      opts.onProcessing?.();
      const list = alts.length ? [...new Set(alts)] : interim ? [interim] : [];
      if (!list.length) {
        resolve(emptyResult("webspeech", error || (heardAny ? "no-words" : "empty")));
        return;
      }
      resolve(packAlts(opts.expected, list, "webspeech", opts.targetWord, error));
    };

    const requestStop = () => {
      wantStop = true;
      try {
        rec.stop();
      } catch {
        finish();
      }
    };
    opts.onReadyStop?.(requestStop);

    const rec = new Ctor();
    rec.lang = opts.lang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onspeechstart = () => {
      heardAny = true;
      lastSpeechAt = performance.now();
      opts.onSounding?.(true);
      opts.onLevel?.(0.15);
    };

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i];
        if (!row) continue;
        const texts: string[] = [];
        for (let a = 0; a < Math.min(row.length || 1, 5); a++) {
          const t = ((row as unknown as { [k: number]: { transcript?: string } })[a]?.transcript || "").trim();
          if (t) texts.push(t);
        }
        const text = texts[0] || "";
        if ((row as { isFinal?: boolean }).isFinal) {
          if (texts.length) {
            for (const t of texts) if (!alts.includes(t)) alts.push(t);
            heardAny = true;
            lastSpeechAt = performance.now();
            opts.onSounding?.(true);
            opts.onLevel?.(0.22);
            opts.onInterim?.(alts[0]!);
          }
          interim = "";
          if (alts.length && performance.now() - started >= waitStartMs) {
            requestStop();
            return;
          }
        } else if (text) {
          interim = text;
          heardAny = true;
          lastSpeechAt = performance.now();
          opts.onSounding?.(true);
          opts.onLevel?.(0.12);
          opts.onInterim?.(text);
        }
      }
    };

    rec.onerror = (ev) => {
      const err = ev?.error || "speech-error";
      if (err === "not-allowed" || err === "service-not-allowed") {
        finish("not-allowed");
        return;
      }
      if (wantStop || settled) return;
      if (err === "no-speech" || err === "aborted" || err === "network") return;
      finish(err);
    };

    const started = performance.now();

    rec.onend = () => {
      if (settled) return;
      if (wantStop || alts.length) {
        finish(alts.length || interim ? undefined : heardAny ? "no-words" : "empty");
        return;
      }
      if (performance.now() - started >= maxMs) {
        finish(alts.length || interim ? undefined : "empty");
        return;
      }
      try {
        rec.start();
      } catch {
        finish(alts.length || interim ? undefined : "restart-failed");
      }
    };

    maxTimer = window.setTimeout(() => requestStop(), maxMs);
    pollTimer = window.setInterval(() => {
      if (settled) return;
      const elapsed = performance.now() - started;
      if (
        elapsed >= waitStartMs &&
        heardAny &&
        lastSpeechAt > 0 &&
        performance.now() - lastSpeechAt >= silenceMs
      ) {
        requestStop();
      }
    }, 120);
    idleTimer = window.setInterval(() => {
      if (settled) return;
      opts.onLevel?.(0.015 + Math.random() * 0.03);
    }, 100);

    try {
      rec.start();
    } catch {
      finish("start-failed");
    }
  });
}

export async function listenOnce(opts: ListenOpts): Promise<AsrResult> {
  const patched: ListenOpts = {
    ...opts,
    maxMs: opts.maxMs ?? DEFAULT_MAX_MS,
    waitStartMs: opts.waitStartMs ?? WAIT_START_MS,
    silenceMs: opts.silenceMs ?? SILENCE_AFTER_MS,
  };

  // Один движок за нажатие (не запускаем второй после СТОП).
  // Vosk: реальный VU + downsample 16 kHz + mute (иначе AEC глушит речь).
  if (await voskModelAvailable()) {
    return listenWithVosk(patched);
  }
  if (getSpeechRecognition()) {
    return listenWebSpeech(patched);
  }
  return emptyResult("none", "no-asr");
}
