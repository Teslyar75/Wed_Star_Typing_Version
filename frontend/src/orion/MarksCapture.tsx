/** Правый щелчок в любом окне пульта: пометка для Ориона (порт stamina/cockpit._mark_point). */
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { titleKeyForTab } from "../shell/compartments";
import { useDeepRoute } from "../shell/routeStore";
import type { Tab } from "../shell/tabs";
import { add, describe, widgetLabel } from "./marks";
import { ot } from "./orionI18n";

type Props = { tab: Tab };

export default function MarksCapture({ tab }: Props) {
  const deep = useDeepRoute();
  const [toast, setToast] = useState("");

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      const root = document.querySelector(".cockpit") as HTMLElement | null;
      const rect = root?.getBoundingClientRect();
      const w = Math.round(rect?.width || window.innerWidth);
      const h = Math.round(rect?.height || window.innerHeight);
      const x = Math.round(e.clientX - (rect?.left || 0));
      const y = Math.round(e.clientY - (rect?.top || 0));
      const zone = t(titleKeyForTab(tab)).toUpperCase();
      const subtab = deep[0]?.label || "";
      const mark = add({
        x, y, root: [w, h],
        zone,
        subtab,
        widget: widgetLabel(target),
        note: "",
      });
      const text = describe(mark);
      void navigator.clipboard?.writeText(text).then(() => {
        setToast("⊕ " + text + "  ·  " + ot("copied"));
      }).catch(() => setToast("⊕ " + text));
      window.setTimeout(() => setToast(""), 3500);
    };
    window.addEventListener("contextmenu", onCtx, true);
    return () => window.removeEventListener("contextmenu", onCtx, true);
  }, [tab, deep]);

  if (!toast) return null;
  return (
    <div className="orion-mark-toast" role="status">{toast}</div>
  );
}
