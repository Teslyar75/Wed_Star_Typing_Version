/** Окно гида: низ экрана, ≤25% высоты, без затемнения и прокрутки. Только клавиатура. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { guideById } from "./guides";
import { speakGuide } from "./voice";
import { useGuide } from "./guideStore";
import { dialogBottom } from "./placement";
import "./guide.css";

export default function GuideDialog() {
  const popup = useGuide((s) => s.popup);
  const st = useGuide((s) => s.st);
  const stopRef = useRef<() => void>(() => undefined);
  const boxRef = useRef<HTMLElement>(null);
  const [bottom, setBottom] = useState<number | null>(null);

  // не закрывать ряд «Пауза / Заново» (и прочие .guide-avoid): ставим окно под ним или над ним
  useLayoutEffect(() => {
    if (!popup) return;
    const place = () => {
      const h = boxRef.current?.getBoundingClientRect().height || 0;
      const avoid = [...document.querySelectorAll<HTMLElement>(".bridge-actions, .guide-avoid")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ top: r.top, bottom: r.bottom }));
      setBottom(dialogBottom(window.innerHeight, h, avoid));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [popup]);

  // набор текста на мостике → окна ждут паузы
  useEffect(() => {
    const onType = () => useGuide.getState().noteTyping();
    window.addEventListener("st-type", onType);
    const iv = window.setInterval(() => useGuide.getState().pump(), 1000);
    return () => {
      window.removeEventListener("st-type", onType);
      window.clearInterval(iv);
    };
  }, []);

  const line = popup ? popup.lines[popup.idx] : "";
  useEffect(() => {
    stopRef.current();
    stopRef.current = () => undefined;
    if (line && st.voice) stopRef.current = speakGuide(st.id, line, st.volume);
    return () => stopRef.current();
  }, [line, st.voice, st.id, st.volume]);


  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      const g = useGuide.getState();
      const k = e.key.toLowerCase();
      let hit = true;
      if (e.key === "Escape" && e.shiftKey) g.muteCurrent();
      else if (e.key === "Escape") g.close();
      else if (e.key === "Enter" || e.key === " ") g.next();
      else if ((k === "v" || k === "м") && !e.ctrlKey && !e.altKey && !e.metaKey) g.patch({ voice: !g.st.voice });
      else hit = false;
      if (hit) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [popup]);

  if (!popup) return null;
  const g = guideById(st.id);
  const last = popup.idx + 1 >= popup.lines.length;
  return (
    <aside ref={boxRef} style={bottom !== null ? { bottom } : undefined} className="guide-dlg" role="dialog" aria-live="polite" aria-label={g?.name || "Гид"} data-trigger={popup.trigger}>
      <div className="guide-portrait" aria-hidden>
        {g?.portrait || "◎"}
      </div>
      <div className="guide-body">
        <div className="guide-who">
          <b>{g?.name}</b> <span>· {g?.title}</span>
          <span className="guide-count">
            {popup.idx + 1}/{popup.lines.length}
          </span>
        </div>
        <p className="guide-line">{line}</p>
        <div className="guide-keys">
          <span>
            <kbd>Enter</kbd> {last && popup.onYes ? "да" : last ? "понятно" : "дальше"}
          </span>
          <span>
            <kbd>Esc</kbd> {last && popup.onYes ? "позже" : "закрыть"}
          </span>
          <span>
            <kbd>Shift+Esc</kbd> больше не показывать
          </span>
          <span>
            <kbd>V</kbd> голос: {st.voice ? "вкл" : "выкл"}
          </span>
        </div>
      </div>
    </aside>
  );
}
