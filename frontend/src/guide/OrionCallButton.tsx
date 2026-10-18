/** Кнопка вызова Ориона. Горячая клавиша: Home. */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang } from "../i18n";
import { shouldBlockChromeHotkey } from "../shell/keyboardNav";
import { useGuide } from "./guideStore";
import { runOrionCall, type OrionCallPhase } from "./orionCall";

export const ORION_HOTKEY = "Home";
export const ORION_CALL_EVENT = "st-orion-call";

const L: Record<string, { btn: string; tip: string; listen: string; off: string }> = {
  ru: {
    btn: "ОРИОН",
    tip: "Орион: кнопка или Home",
    listen: "…",
    off: "Орион выключен — включите гида в настройках",
  },
  uk: {
    btn: "ОРІОН",
    tip: "Оріон: кнопка або Home",
    listen: "…",
    off: "Оріон вимкнено — увімкніть гіда в налаштуваннях",
  },
  en: {
    btn: "ORION",
    tip: "Orion: button or Home",
    listen: "…",
    off: "Orion is off — enable the guide in settings",
  },
  de: {
    btn: "ORION",
    tip: "Orion: Schaltfläche oder Home",
    listen: "…",
    off: "Orion aus — Guide in den Einstellungen aktivieren",
  },
};

function label() {
  return L[getLang()] || L.ru!;
}

export function isOrionHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return e.key === "Home";
}

export default function OrionCallButton() {
  const guideOn = useGuide((s) => s.st.id !== "none" && !!s.pilot);
  const [phase, setPhase] = useState<OrionCallPhase>("idle");
  const [heard, setHeard] = useState("");
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== "idle";
  const lab = label();
  const guideOnRef = useRef(guideOn);
  const busyRef = useRef(busy);
  guideOnRef.current = guideOn;
  busyRef.current = busy;

  const toggle = useCallback(() => {
    if (!guideOnRef.current) {
      setStatus(label().off);
      window.setTimeout(() => setStatus(""), 2500);
      return;
    }
    if (busyRef.current) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase("idle");
      setHeard("");
      setStatus("");
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setHeard("");
    setStatus("");
    void runOrionCall({
      signal: ac.signal,
      onPhase: setPhase,
      onHeard: setHeard,
      onStatus: setStatus,
    }).finally(() => {
      abortRef.current = null;
      setPhase("idle");
      setStatus("");
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOrionHotkey(e)) return;
      if (shouldBlockChromeHotkey(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    const onEvt = () => toggle();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(ORION_CALL_EVENT, onEvt);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(ORION_CALL_EVENT, onEvt);
    };
  }, [toggle]);

  const title =
    status ||
    (phase === "listening"
      ? `Слушаю… ${heard || "говорите по-русски"}`
      : phase === "greeting"
        ? "Орион отвечает…"
        : phase === "acting"
          ? "Выполняю…"
          : lab.tip);

  return (
    <button
      type="button"
      className={`hud-btn zone-fs-btn ${busy ? "amber" : "ok"}`}
      title={title}
      aria-label={title}
      aria-keyshortcuts="Home"
      aria-pressed={busy}
      onClick={toggle}
    >
      {phase === "listening" ? "◉ МИК" : phase === "greeting" || phase === "acting" ? lab.listen : lab.btn}
    </button>
  );
}
