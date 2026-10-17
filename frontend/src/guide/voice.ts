import { speakUtterance, stopSpeaking } from "../english/speak";
import { useRadio } from "../radio/radioStore";
import { guideById } from "./guides";

const DUCK_REASON = "guide";

export function speakGuide(guideId: string, text: string, volume = 3): () => void {
  const g = guideById(guideId);
  if (!g) return () => undefined;
  const radio = useRadio.getState();
  radio.holdDuck(DUCK_REASON);
  const unduck = () => useRadio.getState().releaseDuck(DUCK_REASON);
  // edge-tts (/api/tts); при сбое speak.ts сам уходит в Web Speech
  const stop = speakUtterance({
    text: text.replace(/\[[^\]]*\]/g, ""),
    lang: "ru",
    engine: "hd",
    voice: g.voice,
    rate: g.rate,
    volume: volume / 4,
    onEnd: unduck,
    onError: unduck,
  });
  return () => {
    stop();
    unduck();
  };
}

/** Промис до конца фразы; по завершении TTS полностью гасится (чтобы микрофон слышал пилота). */
export function speakGuideAsync(guideId: string, text: string, volume = 3): Promise<void> {
  return new Promise((resolve) => {
    const g = guideById(guideId);
    if (!g) {
      resolve();
      return;
    }
    const radio = useRadio.getState();
    radio.holdDuck(DUCK_REASON);
    const unduck = () => useRadio.getState().releaseDuck(DUCK_REASON);
    let settled = false;
    let stop: (() => void) | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      stop?.();
      stopSpeaking();
      unduck();
      resolve();
    };
    const clean = text.replace(/\[[^\]]*\]/g, "");
    stop = speakUtterance({
      text: clean,
      lang: "ru",
      engine: "hd",
      voice: g.voice,
      rate: g.rate,
      volume: volume / 4,
      onEnd: finish,
      onError: finish,
    });
    window.setTimeout(finish, Math.min(14_000, Math.max(2800, clean.length * 90)));
  });
}
