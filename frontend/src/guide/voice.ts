import { speakUtterance } from "../english/speak";
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
