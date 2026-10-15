/** TTS: HD-нейроголос с сервера (/api/tts), при сбое — лучший голос браузера. */
import { detectLang, HD_DEFAULTS, langOf, loadBrowserVoices, loadPrefs, pickBrowserVoice, type TtsLang } from "./voices";

export { pickBrowserVoice as pickVoice, voiceRank } from "./voices";

export type SpeakOpts = {
  text: string;
  lang?: string;
  rate?: number;
  /** принудительно: голос HD (id) или браузерный (name) — для превью */
  voice?: string;
  engine?: "hd" | "browser";
  /** 0…1 (по умолчанию 1) */
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
};

let current: HTMLAudioElement | null = null;
/** Сервер HD недоступен — не дёргаем его до перезагрузки (кроме явного превью). */
let hdDown = false;

function stopAll() {
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export async function hasEnglishVoice(): Promise<boolean> {
  if (!hdDown && loadPrefs().engine === "hd") return true;
  const voices = await loadBrowserVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith("en"));
}

export async function bestEnglishVoiceName(): Promise<string | null> {
  const p = loadPrefs();
  if (p.engine === "hd" && !hdDown) return p.hd.en || HD_DEFAULTS.en;
  return pickBrowserVoice(await loadBrowserVoices(), "en-US", p.browser.en)?.name || null;
}

function speakBrowser(opts: SpeakOpts, lang: TtsLang, rate: number, isCancelled: () => boolean) {
  if (!window.speechSynthesis) {
    opts.onError?.("no-tts");
    opts.onEnd?.();
    return;
  }
  const prefs = loadPrefs();
  const u = new SpeechSynthesisUtterance(opts.text);
  if (opts.volume !== undefined) u.volume = Math.max(0, Math.min(1, opts.volume));
  u.lang = opts.lang || lang;
  u.rate = rate;
  u.pitch = 1;
  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => {
    opts.onError?.("tts-error");
    opts.onEnd?.();
  };
  void loadBrowserVoices().then((voices) => {
    if (isCancelled()) return;
    const preferred = opts.engine === "browser" && opts.voice ? opts.voice : prefs.browser[lang];
    const voice = pickBrowserVoice(voices, lang, preferred);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || u.lang;
    } else if (lang === "en") {
      opts.onError?.("no-en-voice");
    }
    window.speechSynthesis.speak(u);
  });
}

export function speakUtterance(opts: SpeakOpts): () => void {
  if (!opts.text.trim()) {
    opts.onError?.("no-tts");
    return () => undefined;
  }
  stopAll();
  const prefs = loadPrefs();
  const lang = opts.lang ? langOf(opts.lang) : detectLang(opts.text);
  const rate = Math.max(0.5, Math.min(1.5, (opts.rate ?? 1) * (prefs.rate || 1)));
  const engine = opts.engine || prefs.engine;
  let cancelled = false;
  const isCancelled = () => cancelled;

  const useHd = engine === "hd" && (!hdDown || (opts.engine === "hd" && !!opts.voice));
  if (useHd && typeof Audio !== "undefined") {
    const voice = (opts.engine === "hd" && opts.voice) || prefs.hd[lang] || HD_DEFAULTS[lang];
    const q = new URLSearchParams({ text: opts.text.slice(0, 1000), voice, rate: rate.toFixed(2) });
    const a = new Audio(`/api/tts?${q}`);
    if (opts.volume !== undefined) a.volume = Math.max(0, Math.min(1, opts.volume));
    current = a;
    let started = false;
    a.onplaying = () => {
      started = true;
      opts.onStart?.();
    };
    a.onended = () => opts.onEnd?.();
    a.onerror = () => {
      if (cancelled || current !== a) return;
      current = null;
      if (!started) {
        hdDown = true; // офлайн / нет edge-tts → браузерный голос
        opts.onError?.("hd-fallback");
        speakBrowser(opts, lang, rate, isCancelled);
      } else opts.onEnd?.();
    };
    void a.play().catch(() => {
      /* onerror обработает сетевой сбой; autoplay-блок — молча */
    });
  } else {
    speakBrowser(opts, lang, rate, isCancelled);
  }

  return () => {
    cancelled = true;
    stopAll();
  };
}

/** Короткий хелпер для мест, где нужен только звук слова/фразы. */
export function speakText(text: string, lang?: string): void {
  speakUtterance({ text, lang });
}
