/** Общий UI общения экипажа (лента/копировать/просмотр/диктовка). Без ИИ. */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { mdToHtml } from "../docs/docsMd";
import { speakUtterance, stopSpeaking } from "../english/speak";

export function fmtWhen(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * (ts < 1e12 ? 1000 : 1));
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function readImageFile(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export function CopyBtn({ text, copiedLabel, copyLabel }: { text: string; copiedLabel?: string; copyLabel?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="hud-btn orion-mini"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? copiedLabel || t("comm_copied") : copyLabel || t("comm_copy")}
    </button>
  );
}

export function SpeakBtn({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="hud-btn orion-mini"
      disabled={!text.trim()}
      onClick={() => {
        stopSpeaking();
        speakUtterance({ text: text.slice(0, 1000) });
      }}
    >
      {t("comm_speak")}
    </button>
  );
}

export function MediaViewer({
  img,
  text,
  onClose,
}: {
  img?: string;
  text?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="orion-viewer" data-testid="comm-viewer" onClick={onClose}>
      <div className="orion-viewer-box" onClick={(e) => e.stopPropagation()}>
        {img ? <img src={img} alt="" className="orion-viewer-img" /> : null}
        {text ? (
          <div className="orion-viewer-text" dangerouslySetInnerHTML={{ __html: mdToHtml("", text) }} />
        ) : null}
        {text ? <CopyBtn text={text} /> : null}
        <button type="button" className="hud-btn" onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Диктовка в поле ввода (Web Speech). Без авто-отправки в ИИ. */
export function useDictation(opts: {
  onText: (s: string) => void;
  onStatus: (s: string) => void;
  lang?: string;
}) {
  const armedRef = useRef(false);
  const micGen = useRef(0);
  const recRef = useRef<Rec | null>(null);
  const [listening, setListening] = useState(false);

  const stop = () => {
    micGen.current += 1;
    armedRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    setListening(false);
    opts.onStatus("");
  };

  const start = (hold: boolean) => {
    const w = window as unknown as { webkitSpeechRecognition?: new () => Rec; SpeechRecognition?: new () => Rec };
    const Ctor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Ctor) {
      opts.onStatus(t("comm_mic_none"));
      return;
    }
    const gen = ++micGen.current;
    armedRef.current = true;
    const rec = new Ctor();
    rec.lang = opts.lang || "ru-RU";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      if (micGen.current !== gen) return;
      let s = "";
      const res = ev.results;
      for (let i = 0; i < res.length; i++) s += res[i][0].transcript;
      opts.onText(s);
      setListening(true);
      opts.onStatus(t("comm_listening"));
      void hold;
    };
    rec.onerror = (ev) => {
      if (micGen.current !== gen) return;
      const err = ev?.error || "";
      if (err === "no-speech" || err === "aborted") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        armedRef.current = false;
        setListening(false);
        opts.onStatus(t("comm_mic_denied"));
        return;
      }
      if (err === "network") opts.onStatus(t("comm_mic_net"));
    };
    rec.onend = () => {
      if (micGen.current !== gen || !armedRef.current) {
        if (micGen.current === gen) {
          setListening(false);
          opts.onStatus("");
        }
        return;
      }
      window.setTimeout(() => {
        if (micGen.current !== gen || !armedRef.current) return;
        try {
          rec.start();
        } catch {
          /* */
        }
      }, 120);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      opts.onStatus(t("comm_listening"));
    } catch (e) {
      armedRef.current = false;
      setListening(false);
      opts.onStatus((e as Error).message || t("comm_mic_none"));
    }
  };

  const toggle = () => {
    if (armedRef.current || listening) stop();
    else start(false);
  };

  useEffect(() => () => stop(), []);

  return { listening, start, stop, toggle };
}

export function MdBody({ text }: { text: string }) {
  if (!text) return null;
  return <div className="orion-msg-text comm-md" dangerouslySetInnerHTML={{ __html: mdToHtml("", text) }} />;
}
