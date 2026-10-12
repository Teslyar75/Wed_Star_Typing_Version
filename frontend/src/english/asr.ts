/**
 * ASR: Web Speech API сейчас; vosk-browser — если загружена модель в /models/vosk-model-small-en-us.tar.gz
 * (или VITE_VOSK_MODEL_URL). Каркас без обязательной WASM-зависимости в бандле.
 */
import { scoreSentence } from "./textutil";

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

function getSpeechRecognition(): (new () => SR) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Проверка доступности vosk-модели (без загрузки WASM, пока нет URL). */
export async function voskModelAvailable(): Promise<boolean> {
  const url = (import.meta as { env?: { VITE_VOSK_MODEL_URL?: string } }).env?.VITE_VOSK_MODEL_URL
    || "/models/vosk-model-small-en-us.tar.gz";
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

export function listenOnce(opts: {
  expected: string;
  targetWord?: string;
  lang?: string;
  onInterim?: (text: string) => void;
  onLevel?: (pct: number) => void;
}): Promise<AsrResult> {
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    return Promise.resolve({ transcript: "", score: 0, engine: "none" });
  }

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

/**
 * Точка расширения vosk-browser:
 * 1) положить модель в public/models/
 * 2) npm i vosk-browser
 * 3) реализовать createModel + KaldiRecognizer здесь
 */
export async function listenWithVosk(_opts: {
  expected: string;
  targetWord?: string;
  onInterim?: (text: string) => void;
}): Promise<AsrResult> {
  const ok = await voskModelAvailable();
  if (!ok) return { transcript: "", score: 0, engine: "none" };
  // Модель есть, но WASM ещё не подключён в бандл — явный сигнал для UI.
  return {
    transcript: "",
    score: 0,
    engine: "vosk",
  };
}
