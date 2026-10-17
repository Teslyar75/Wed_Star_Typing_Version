/** Кнопка вызова Ориона — рядом со СЛАЙДЫ / ЭКРАН. Приветствие → микрофон → команды. */
import { useRef, useState } from "react";
import { getLang } from "../i18n";
import { useGuide } from "./guideStore";
import { runOrionCall, type OrionCallPhase } from "./orionCall";

const L: Record<string, { btn: string; tip: string; listen: string }> = {
  ru: { btn: "ОРИОН", tip: "Вызвать Ориона — скажите «шутка» или «смени волну»", listen: "…" },
  uk: { btn: "ОРІОН", tip: "Викликати Оріона — «жарт» або «зміни хвилю»", listen: "…" },
  en: { btn: "ORION", tip: "Call Orion — say “joke” or “next station”", listen: "…" },
  de: { btn: "ORION", tip: "Orion rufen — „Witz“ oder „Sender wechseln“", listen: "…" },
};

function label() {
  return L[getLang()] || L.ru!;
}

export default function OrionCallButton() {
  const guideOn = useGuide((s) => s.st.id !== "none" && !!s.pilot);
  const [phase, setPhase] = useState<OrionCallPhase>("idle");
  const [heard, setHeard] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== "idle";
  const lab = label();

  const onClick = () => {
    if (!guideOn) return;
    if (busy) {
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
  };

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
      aria-pressed={busy}
      disabled={!guideOn}
      onClick={onClick}
    >
      {phase === "listening" ? "◉" : phase === "greeting" || phase === "acting" ? lab.listen : lab.btn}
    </button>
  );
}
