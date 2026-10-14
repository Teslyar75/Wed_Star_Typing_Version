import { useState } from "react";
import { t } from "../i18n";
import { speakUtterance } from "./speak";

type Props = {
  text: string;
  label?: string;
  rate?: number;
  className?: string;
  onDuck?: (on: boolean) => void;
  /** lang принудительно; иначе определяется по тексту (en / ru) */
  lang?: string;
};

export default function SpeakButton({ text, label, rate = 1, className = "hud-btn", onDuck, lang }: Props) {
  const [reading, setReading] = useState(false);
  const [hint, setHint] = useState("");

  const go = () => {
    if (!text.trim()) return;
    setHint("");
    onDuck?.(true);
    speakUtterance({
      text,
      lang,
      rate,
      onStart: () => setReading(true),
      onEnd: () => {
        setReading(false);
        onDuck?.(false);
      },
      onError: (msg) => {
        setReading(false);
        onDuck?.(false);
        if (msg === "no-en-voice") setHint(t("en_tts_no_en"));
      },
    });
  };

  return (
    <span className="en-speak-wrap">
      <button
        type="button"
        className={`${className}${reading ? " amber" : ""}`}
        onClick={go}
        disabled={!text.trim()}
      >
        {reading ? t("en_reading") : label || t("voice")}
      </button>
      {hint ? <span className="muted en-tts-hint">{hint}</span> : null}
    </span>
  );
}
