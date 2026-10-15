/** Выбор голоса озвучки: HD-нейроголоса (сервер) / голоса браузера, превью ▶, скорость. Всё с клавиатуры. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../i18n";
import { speakUtterance } from "./speak";
import {
  HD_DEFAULTS,
  loadBrowserVoices,
  loadHdVoices,
  loadPrefs,
  qualityTag,
  rankVoices,
  SAMPLE,
  savePrefs,
  type HdVoice,
  type TtsLang,
  type VoicePrefs,
} from "./voices";

const LANGS: TtsLang[] = ["en", "ru", "uk", "de"];

type Item = { key: string; label: string; meta: string; tag: string };

export default function VoicePicker() {
  const [p, setP] = useState<VoicePrefs>(loadPrefs);
  const [lang, setLang] = useState<TtsLang>("en");
  const [accent, setAccent] = useState<string>("ALL");
  const [hd, setHd] = useState<HdVoice[]>([]);
  const [browser, setBrowser] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState<string>("");
  const [note, setNote] = useState("");
  const stopRef = useRef<() => void>(() => undefined);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadHdVoices().then(setHd);
    void loadBrowserVoices().then(setBrowser);
    const ss = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const upd = () => setBrowser(ss?.getVoices() || []);
    ss?.addEventListener?.("voiceschanged", upd);
    return () => {
      ss?.removeEventListener?.("voiceschanged", upd);
      stopRef.current();
    };
  }, []);

  const update = (n: VoicePrefs) => {
    setP(n);
    savePrefs(n);
  };

  const accents = useMemo(() => {
    const a = new Set(hd.filter((v) => v.lang === lang).map((v) => v.accent));
    return a.size > 1 ? ["ALL", ...a] : [];
  }, [hd, lang]);

  const items: Item[] = useMemo(() => {
    if (p.engine === "hd") {
      return hd
        .filter((v) => v.lang === lang && (accent === "ALL" || v.accent === accent))
        .map((v) => ({ key: v.id, label: v.name, meta: `${v.accent} ${v.gender === "F" ? "♀" : "♂"}`, tag: "HD" }));
    }
    return rankVoices(browser, lang).map((v) => ({
      key: v.name,
      label: v.name.replace(/^Microsoft\s+|\s+Online \(Natural\)|\s+-\s+.*$/g, ""),
      meta: v.lang,
      tag: qualityTag(v),
    }));
  }, [p.engine, hd, browser, lang, accent]);

  const selected = p.engine === "hd" ? p.hd[lang] || HD_DEFAULTS[lang] : p.browser[lang] || items[0]?.key || "";

  const choose = (key: string) => {
    if (p.engine === "hd") update({ ...p, hd: { ...p.hd, [lang]: key } });
    else update({ ...p, browser: { ...p.browser, [lang]: key } });
  };

  const preview = (key: string) => {
    stopRef.current();
    setNote("");
    setPlaying(key);
    stopRef.current = speakUtterance({
      text: SAMPLE[lang],
      lang,
      voice: key,
      engine: p.engine,
      onEnd: () => setPlaying(""),
      onError: (m) => {
        if (m === "hd-fallback") setNote(t("tts_hd_offline"));
        else if (m !== "tts-error") setNote(t("en_tts_no_en"));
      },
    });
  };

  /** Стрелки — по сетке голосов, Enter — выбрать, Пробел/P — прослушать. */
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button.voice-pick") || []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const cols = 3;
    const go = (j: number) => {
      e.preventDefault();
      e.stopPropagation();
      btns[Math.max(0, Math.min(btns.length - 1, j))]?.focus();
    };
    if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "ArrowDown") go(i + cols);
    else if (e.key === "ArrowUp") go(i - cols);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(btns.length - 1);
    else if (e.key === " " || e.key.toLowerCase() === "p" || e.key.toLowerCase() === "з") {
      e.preventDefault();
      e.stopPropagation();
      const k = btns[i].dataset.key || "";
      preview(k);
    }
  };

  return (
    <div className="voice-picker" aria-label={t("tts_voice")}>
      <div className="en-set-row">
        <span>{t("tts_engine")}</span>
        <div className="en-filter-row" role="radiogroup" aria-label={t("tts_engine")}>
          {(["hd", "browser"] as const).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={p.engine === e}
              className={`hud-btn en-chip ${p.engine === e ? "amber" : ""}`}
              onClick={() => update({ ...p, engine: e })}
              title={t(e === "hd" ? "tts_engine_hd_hint" : "tts_engine_browser_hint")}
            >
              {t(e === "hd" ? "tts_engine_hd" : "tts_engine_browser")}
            </button>
          ))}
        </div>
      </div>
      <div className="en-set-row">
        <div className="en-filter-row" role="radiogroup" aria-label={t("tts_lang")}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              className={`hud-btn en-chip ${lang === l ? "amber" : ""}`}
              onClick={() => {
                setLang(l);
                setAccent("ALL");
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        {p.engine === "hd" && accents.length > 0 && (
          <div className="en-filter-row" role="radiogroup" aria-label={t("tts_accent")}>
            {accents.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                className={`hud-btn en-chip ${accent === a ? "ok" : ""}`}
                onClick={() => setAccent(a)}
              >
                {a === "ALL" ? t("tts_all") : a}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="voice-grid" ref={gridRef} onKeyDown={onGridKey} role="listbox" aria-label={t("tts_voice")}>
        {items.length === 0 && <span className="muted">{t(p.engine === "hd" ? "tts_hd_offline" : "en_tts_no_en")}</span>}
        {items.map((it) => (
          <div key={it.key} className={`voice-cell ${selected === it.key ? "on" : ""}`}>
            <button
              type="button"
              role="option"
              aria-selected={selected === it.key}
              className="hud-btn voice-pick"
              data-key={it.key}
              title={it.key}
              onClick={() => choose(it.key)}
            >
              <span className={`voice-tag q-${it.tag}`}>{it.tag}</span>
              <span className="voice-name">{it.label}</span>
              <span className="mono muted voice-meta">{it.meta}</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              className={`hud-btn voice-play ${playing === it.key ? "amber" : ""}`}
              aria-label={`${t("tts_preview")} ${it.label}`}
              onClick={() => preview(it.key)}
            >
              ▶
            </button>
          </div>
        ))}
      </div>
      <label className="en-set-row">
        {t("en_tts_rate")}
        <input
          type="range"
          min={0.6}
          max={1.4}
          step={0.05}
          value={p.rate}
          onChange={(e) => update({ ...p, rate: Number(e.target.value) })}
        />
        <span className="mono muted">{p.rate.toFixed(2)}</span>
        <button type="button" className="hud-btn" onClick={() => preview(selected)}>
          ▶ {t("en_test_voice")}
        </button>
      </label>
      <p className="muted voice-keys">{note || t("tts_keys_hint")}</p>
    </div>
  );
}
