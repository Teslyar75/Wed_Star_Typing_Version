/**
 * ASR: vosk-browser (если есть модель) → fallback Web Speech API.
 * Модель: public/models/vosk-model-small-en-us.tar.gz → кэш IndexedDB (voskCache).
 */
import { scoreSentence } from "./textutil";
import { resolveVoskModelUrl, voskCachedOrRemote } from "./voskCache";

export type AsrResult = { transcript: string; score: number; engine: "webspeech" | "vosk" | "none" };

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onend: (() => void) | null;
};

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

let modelPromise: Promise<unknown> | null = null;
let objectUrl: string | null = null;

async function getVoskModel(): Promise<{
  KaldiRecognizer: new (sampleRate: number) => {
    on: (ev: string, fn: (msg: { result: { text?: string; partial?: string } }) => void) => void;
    acceptWaveform: (buf: AudioBuffer) => void;
    remove: () => void;
  };
  terminate: () => void;
}> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { createModel } = await import("vosk-browser");
      objectUrl = await resolveVoskModelUrl(modelUrl());
      return createModel(objectUrl);
    })();
  }
  return modelPromise as Promise<{
    KaldiRecognizer: new (sampleRate: number) => {
      on: (ev: string, fn: (msg: { result: { text?: string; partial?: string } }) => void) => void;
      acceptWaveform: (buf: AudioBuffer) => void;
      remove: () => void;
    };
    terminate: () => void;
  }>;
}

export async function listenWithVosk(opts: {
  expected: string;
  targetWord?: string;
  onInterim?: (text: string) => void;
  onLevel?: (pct: number) => void;
  maxMs?: number;
}): Promise<AsrResult> {
  if (!(await voskModelAvailable())) return { transcript: "", score: 0, engine: "none" };

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  let recognizer: { remove: () => void } | null = null;
  const pulse = window.setInterval(() => opts.onLevel?.((Date.now() / 12) % 100), 120);

  try {
    const model = await getVoskModel();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    ctx = new AudioContext();
    const sampleRate = ctx.sampleRate;
    const rec = new model.KaldiRecognizer(sampleRate);
    recognizer = rec;
    let finalText = "";

    rec.on("partialresult", (message) => {
      const p = message.result.partial || "";
      if (p) opts.onInterim?.(p);
    });
    rec.on("result", (message) => {
      const t = (message.result.text || "").trim();
      if (t) {
        finalText = finalText ? `${finalText} ${t}` : t;
        opts.onInterim?.(finalText);
      }
    });

    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => {
      try {
        rec.acceptWaveform(event.inputBuffer);
      } catch {
        /* ignore underrun */
      }
    };
    const source = ctx.createMediaStreamSource(stream);
    source.connect(node);
    node.connect(ctx.destination);

    await new Promise((r) => setTimeout(r, opts.maxMs ?? 4000));

    window.clearInterval(pulse);
    opts.onLevel?.(0);
    const { score } = scoreSentence(opts.expected, finalText, opts.targetWord);
    return { transcript: finalText, score, engine: "vosk" };
  } catch {
    window.clearInterval(pulse);
    opts.onLevel?.(0);
    return { transcript: "", score: 0, engine: "none" };
  } finally {
    try {
      recognizer?.remove();
    } catch {
      /* */
    }
    try {
      node?.disconnect();
    } catch {
      /* */
    }
    try {
      await ctx?.close();
    } catch {
      /* */
    }
    stream?.getTracks().forEach((t) => t.stop());
  }
}

function listenWebSpeech(opts: {
  expected: string;
  targetWord?: string;
  lang?: string;
  onInterim?: (text: string) => void;
  onLevel?: (pct: number) => void;
}): Promise<AsrResult> {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return Promise.resolve({ transcript: "", score: 0, engine: "none" });

  return new Promise((resolve) => {
    const rec = new Ctor();
    rec.lang = opts.lang || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    const pulse = window.setInterval(() => opts.onLevel?.((Date.now() / 12) % 100), 120);

    rec.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      const text = last?.[0]?.transcript || "";
      opts.onInterim?.(text);
      if (last && (last as { isFinal?: boolean }).isFinal) finalText = text;
      else if (!finalText) finalText = text;
    };
    rec.onerror = () => {
      window.clearInterval(pulse);
      opts.onLevel?.(0);
      resolve({ transcript: finalText, score: 0, engine: "webspeech" });
    };
    rec.onend = () => {
      window.clearInterval(pulse);
      opts.onLevel?.(0);
      const { score } = scoreSentence(opts.expected, finalText, opts.targetWord);
      resolve({ transcript: finalText, score, engine: "webspeech" });
    };
    try {
      rec.start();
    } catch {
      window.clearInterval(pulse);
      resolve({ transcript: "", score: 0, engine: "none" });
    }
  });
}

/** Предпочитает vosk, иначе Web Speech. */
export async function listenOnce(opts: {
  expected: string;
  targetWord?: string;
  lang?: string;
  onInterim?: (text: string) => void;
  onLevel?: (pct: number) => void;
}): Promise<AsrResult> {
  if (await voskModelAvailable()) {
    const vosk = await listenWithVosk(opts);
    if (vosk.engine === "vosk") return vosk;
  }
  return listenWebSpeech(opts);
}
