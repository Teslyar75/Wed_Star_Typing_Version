/** TTS: явный en-* голос, приоритет Neural/Natural (Edge/Windows). */

export type SpeakOpts = {
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
};

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!window.speechSynthesis) return Promise.resolve([]);
  const cur = window.speechSynthesis.getVoices();
  if (cur.length) return Promise.resolve(cur);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const done = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", done);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", done);
      window.setTimeout(done, 500);
    });
  }
  return voicesReady;
}

function preferLang(text: string, explicit?: string): string {
  if (explicit) return explicit;
  if (/[\u0400-\u04FF]/.test(text)) return "ru-RU";
  return "en-US";
}

/** Оценка качества голоса: Neural/Natural выше старых SAPI. */
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.lang}`.toLowerCase();
  let s = 0;
  if (/neural|natural|online/.test(n)) s += 100;
  if (/aria|jenny|guy|davis|ryan|sonia|sara|emma|libby|michelle|andrew/.test(n)) s += 40;
  if (/google|microsoft|apple|samantha|daniel/.test(n)) s += 20;
  if (/en-us/.test(n)) s += 15;
  if (/en-gb/.test(n)) s += 10;
  if (/en-/.test(n)) s += 5;
  if (/zira|david|mark|hazel|susan|desktop/.test(n)) s -= 5; // старые локальные
  if (v.localService === false) s += 25; // online neural в Edge
  return s;
}

/** Выбрать лучший голос по префиксу языка. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const prefix = (lang || "en-US").slice(0, 2).toLowerCase();
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}

export async function hasEnglishVoice(): Promise<boolean> {
  const voices = await loadVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith("en"));
}

export async function bestEnglishVoiceName(): Promise<string | null> {
  const voices = await loadVoices();
  return pickVoice(voices, "en-US")?.name || null;
}

export function speakUtterance(opts: SpeakOpts): () => void {
  if (!opts.text.trim() || !window.speechSynthesis) {
    opts.onError?.("no-tts");
    return () => undefined;
  }
  window.speechSynthesis.cancel();
  const lang = preferLang(opts.text, opts.lang);
  const u = new SpeechSynthesisUtterance(opts.text);
  u.lang = lang;
  u.rate = Math.max(0.5, Math.min(1.4, opts.rate ?? 1));
  u.pitch = 1;
  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => {
    opts.onError?.("tts-error");
    opts.onEnd?.();
  };

  let cancelled = false;
  void loadVoices().then((voices) => {
    if (cancelled) return;
    const voice = pickVoice(voices, lang);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || lang;
    } else if (lang.toLowerCase().startsWith("en")) {
      opts.onError?.("no-en-voice");
    }
    window.speechSynthesis.speak(u);
  });

  return () => {
    cancelled = true;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  };
}
