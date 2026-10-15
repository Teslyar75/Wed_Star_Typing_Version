import { speakUtterance } from "../english/speak";
import { guideById } from "./guides";

export function speakGuide(guideId: string, text: string): () => void {
  const g = guideById(guideId);
  if (!g) return () => undefined;
  // edge-tts (/api/tts); при сбое speak.ts сам уходит в Web Speech
  return speakUtterance({ text: text.replace(/\[[^\]]*\]/g, ""), lang: "ru", engine: "hd", voice: g.voice, rate: g.rate });
}
