/** Кнопка вызова Ориона — рядом со СЛАЙДЫ / ЭКРАН. Также «=», F8 и палитра команд. */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang } from "../i18n";
import { isTextEditTarget } from "../shell/keyboardNav";
import { useGuide } from "./guideStore";
import { runOrionCall, type OrionCallPhase } from "./orionCall";

/** Горячие клавиши: «=» и F8. */
export const ORION_HOTKEY = "=";
export const ORION_HOTKEY_F = "F8";
/** Палитра / внешний вызов: window.dispatchEvent(new Event(ORION_CALL_EVENT)) */
export const ORION_CALL_EVENT = "st-orion-call";

const L: Record<string, { btn: string; tip: string; listen: string }> = {
  ru: {
    btn: "ОРИОН",
    tip: "Вызвать Ориона: кнопка, «=» или F8 — «шутка» / «смени волну»",
    listen: "…",
  },
  uk: {
    btn: "ОРІОН",
    tip: "Виклик Оріона: кнопка, «=» або F8",
    listen: "…",
  },
  en: {
    btn: "ORION",
    tip: "Call Orion: button, «=» or F8",
    listen: "…",
  },
  de: {
    btn: "ORION",
    tip: "Orion: Schaltfläche, «=» oder F8",
    listen: "…",
  },
};

function label() {
  return L[getLang()] || L.ru!;
}

function isOrionHotkey(e: KeyboardEvent): boolean {
  if (e.key === "F8") return true;
  return e.key === "=" || e.code === "Equal" || e.code === "NumpadEqual";
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
    if (!guideOnRef.current) return;
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
      if (!isOrionHotkey(e) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key !== "F8" && isTextEditTarget(e.target)) return;
      if ((e.target as HTMLElement | null)?.classList?.contains("ghost-input")) return;
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
      aria-keyshortcuts="Equal Equal F8"
      aria-pressed={busy}
      disabled={!guideOn}
      onClick={toggle}
    >
      {phase === "listening" ? "◉ МИК" : phase === "greeting" || phase === "acting" ? lab.listen : lab.btn}
    </button>
  );
}
