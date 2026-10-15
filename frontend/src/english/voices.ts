/** Выбор голоса: HD (нейроголоса через /api/tts) + запасной Web Speech API. */

export type TtsEngine = "hd" | "browser";
export type TtsLang = "en" | "ru" | "uk" | "de";

export type HdVoice = { id: string; lang: string; accent: string; gender: "F" | "M"; name: string };

export type VoicePrefs = {
  engine: TtsEngine;
  /** HD-голос по языку */
  hd: Partial<Record<TtsLang, string>>;
  /** имя браузерного голоса по языку ("" = авто) */
  browser: Partial<Record<TtsLang, string>>;
  rate: number;
};

export const HD_DEFAULTS: Record<TtsLang, string> = {
  en: "en-US-AriaNeural",
  ru: "ru-RU-SvetlanaNeural",
  uk: "uk-UA-PolinaNeural",
  de: "de-DE-KatjaNeural",
};

const KEY = "st_tts_voice";
const DEFAULT_PREFS: VoicePrefs = { engine: "hd", hd: {}, browser: {}, rate: 1 };

export function loadPrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<VoicePrefs>;
    return { ...DEFAULT_PREFS, ...raw, hd: { ...(raw.hd || {}) }, browser: { ...(raw.browser || {}) } };
  } catch {
    return { ...DEFAULT_PREFS, hd: {}, browser: {} };
  }
}

const listeners = new Set<() => void>();
export function savePrefs(p: VoicePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(p));
  listeners.forEach((f) => f());
}
export function onPrefsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function langOf(code: string): TtsLang {
  const p = (code || "en").slice(0, 2).toLowerCase();
  return (["en", "ru", "uk", "de"].includes(p) ? p : "en") as TtsLang;
}

/** Определить язык фразы: кириллица → ru (с ґєії → uk), умлауты → de, иначе en. */
export function detectLang(text: string): TtsLang {
  if (/[ґєії]/i.test(text)) return "uk";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[äöüß]/i.test(text)) return "de";
  return "en";
}

type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService">;

/**
 * Ранг браузерного голоса (больше — лучше):
 * Microsoft Natural/Online (Aria, Jenny, Guy…) > Google US/UK English > прочие сетевые > любой локальный.
 */
export function voiceRank(v: VoiceLike): number {
  const n = v.name.toLowerCase();
  const lang = v.lang.toLowerCase().replace("_", "-");
  let s = 0;
  if (/microsoft/.test(n) && /natural|online|neural/.test(n)) s = 1000;
  else if (/natural|neural/.test(n)) s = 900;
  else if (/^google/.test(n)) s = 800;
  else if (v.localService === false) s = 600;
  else if (/samantha|daniel|karen|moira|alex|siri|enhanced|premium/.test(n)) s = 400; // macOS/iOS
  else s = 100;
  if (/espeak|zira|david|mark|hazel|susan|desktop/.test(n)) s -= 80; // старые SAPI / eSpeak
  if (/aria|jenny|guy|andrew|emma|ava|brian|sonia|ryan|libby/.test(n)) s += 30;
  if (lang === "en-us") s += 20;
  else if (lang === "en-gb") s += 15;
  return s;
}

export function qualityTag(v: VoiceLike): "HD" | "NET" | "STD" {
  const r = voiceRank(v);
  if (r >= 800) return "HD";
  if (r >= 400) return "NET";
  return "STD";
}

export function rankVoices<T extends VoiceLike>(voices: T[], lang: string): T[] {
  const prefix = langOf(lang);
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith(prefix))
    .sort((a, b) => voiceRank(b) - voiceRank(a) || a.name.localeCompare(b.name));
}

export function pickBrowserVoice<T extends VoiceLike>(voices: T[], lang: string, preferred?: string): T | null {
  const pool = rankVoices(voices, lang);
  if (preferred) {
    const hit = pool.find((v) => v.name === preferred);
    if (hit) return hit;
  }
  return pool[0] || null;
}

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
export function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  const cur = window.speechSynthesis.getVoices();
  if (cur.length) return Promise.resolve(cur);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        const v = window.speechSynthesis.getVoices();
        if (!v.length) return; // ждём следующего voiceschanged или таймаута
        finished = true;
        window.speechSynthesis.removeEventListener("voiceschanged", done);
        resolve(v);
      };
      window.speechSynthesis.addEventListener("voiceschanged", done);
      window.setTimeout(() => {
        if (finished) return;
        finished = true;
        voicesReady = null;
        resolve(window.speechSynthesis.getVoices());
      }, 1500);
    });
  }
  return voicesReady;
}

let hdList: Promise<HdVoice[]> | null = null;
export function loadHdVoices(): Promise<HdVoice[]> {
  if (!hdList) {
    hdList = fetch("/api/tts/voices")
      .then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((j: { voices: HdVoice[] }) => j.voices || [])
      .catch(() => {
        hdList = null;
        return [];
      });
  }
  return hdList;
}

export const SAMPLE: Record<TtsLang, string> = {
  en: "Navigation channel online. The quick brown fox jumps over the lazy dog.",
  ru: "Канал навигации на связи. Съешь же ещё этих мягких французских булок.",
  uk: "Канал навігації на зв'язку. Чуєш їх, доцю, га? Кумедна ж ти, прощайся без ґольфів!",
  de: "Navigationskanal online. Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.",
};
