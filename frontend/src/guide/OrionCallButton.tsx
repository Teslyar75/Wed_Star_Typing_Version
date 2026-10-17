/** Кнопка вызова Ориона — рядом со СЛАЙДЫ / ЭКРАН. Клавиша «=». */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang } from "../i18n";
import { isTextEditTarget } from "../shell/keyboardNav";
import { useGuide } from "./guideStore";
import { runOrionCall, type OrionCallPhase } from "./orionCall";

/** Горячая клавиша вызова / отмены Ориона. */
export const ORION_HOTKEY = "=";

const L: Record<string, { btn: string; tip: string; listen: string }> = {
  ru: {
    btn: "ОРИОН",
    tip: "Вызвать Ориона («=») — скажите «шутка» или «смени волну»",
    listen: "…",
  },
  uk: {
    btn: "ОРІОН",
    tip: "Викликати Оріона («=») — «жарт» або «зміни хвилю»",
    listen: "…",
  },
  en: {
    btn: "ORION",
    tip: "Call Orion («=») — say “joke” or “next station”",
    listen: "…",
  },
  de: {
    btn: "ORION",
    tip: "Orion rufen («=») — „Witz“ oder „Sender wechseln“",
    listen: "…",
  },
};

function label() {
  return L[getLang()] || L.ru!;
}

function isOrionHotkey(e: KeyboardEvent): boolean {
  return e.key === "=" || e.code === "Equal" || e.code === "NumpadEqual";
}

export default function OrionCallButton() {
  const guideOn = useGuide((s) => s.st.id !== "none" && !!s.pilot);
  const [phase, setPhase] = useState<OrionCallPhase>("idle");
  const [heard, setHeard] = useState("");
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
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setHeard("");
    void runOrionCall({
      signal: ac.signal,
      onPhase: setPhase,
      onHeard: setHeard,
    }).finally(() => {
      abortRef.current = null;
      setPhase("idle");
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOrionHotkey(e) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTextEditTarget(e.target)) return;
      /* во время набора на мостике ghost-input — не вызываем */
      if ((e.target as HTMLElement | null)?.classList?.contains("ghost-input")) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggle]);

  const title =
    phase === "listening"
      ? `Слушаю… ${heard || "говорите"}`
      : phase === "greeting"
        ? "Орион отвечает…"
        : phase === "acting"
          ? "Выполняю…"
          : lab.tip;

  return (
    <button
      type="button"
      className={`hud-btn zone-fs-btn ${busy ? "amber" : "ok"}`}
      title={title}
      aria-label={title}
      aria-keyshortcuts="Equal"
      aria-pressed={busy}
      disabled={!guideOn}
      onClick={toggle}
    >
      {phase === "listening" ? "◉" : phase === "greeting" || phase === "acting" ? `${lab.listen}` : `${lab.btn} =`}
    </button>
  );
}
