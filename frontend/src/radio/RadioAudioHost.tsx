/** Глобальный <audio> — живёт в шапке, не размонтируется при смене вкладок. */
import { useEffect, useRef } from "react";
import { useRadio } from "./radioStore";

export const PILOT_EVENT = "st-pilot";

export default function RadioAudioHost() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const setAudio = useRadio((s) => s.setAudio);
  const tryAutoplayLast = useRadio((s) => s.tryAutoplayLast);
  const bindPilot = useRadio((s) => s.bindPilot);

  useEffect(() => {
    setAudio(audioRef.current);
    let alive = true;
    const bind = async (callsign: string) => {
      await bindPilot(callsign);
      if (alive) window.setTimeout(() => tryAutoplayLast(), 400);
    };
    void (async () => {
      try {
        const me = await fetch("/api/pilots/me", { credentials: "include" });
        const cs = me.ok ? String(((await me.json()) as { callsign?: string }).callsign || "guest") : "guest";
        if (alive) await bind(cs);
      } catch {
        if (alive) await bind("guest");
      }
    })();
    const onPilot = (e: Event) => {
      const cs = String((e as CustomEvent<{ callsign?: string }>).detail?.callsign || "guest");
      void bind(cs);
    };
    window.addEventListener(PILOT_EVENT, onPilot);
    return () => {
      alive = false;
      window.removeEventListener(PILOT_EVENT, onPilot);
    };
  }, [setAudio, tryAutoplayLast, bindPilot]);

  return <audio ref={audioRef} className="radio-audio" crossOrigin="anonymous" preload="none" />;
}
