/** Глобальный <audio> — живёт в шапке, не размонтируется при смене вкладок. */
import { useEffect, useRef } from "react";
import { useRadio } from "./radioStore";

export default function RadioAudioHost() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const setAudio = useRadio((s) => s.setAudio);
  const tryAutoplayLast = useRadio((s) => s.tryAutoplayLast);
  const syncFavsFromServer = useRadio((s) => s.syncFavsFromServer);

  useEffect(() => {
    setAudio(audioRef.current);
    const tmr = window.setTimeout(() => tryAutoplayLast(), 500);
    void syncFavsFromServer();
    return () => {
      clearTimeout(tmr);
      /* не обнуляем audio при HMR/размонтировании App — иначе срывается эфир */
    };
  }, [setAudio, tryAutoplayLast, syncFavsFromServer]);

  return <audio ref={audioRef} className="radio-audio" crossOrigin="anonymous" preload="none" />;
}
