/** Шапка отсека (alt): строка «◈ Заголовок [ОБЗОР ▾]» + крошки. Эталон: docs/ALT_UI.md.
 *  Мостик: экраны — вкладки зоны; прочие отсеки: экраны публикует сама панель (setZoneScreens). */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import type { Tab } from "./tabs";
import PathCrumbs from "./PathCrumbs";
import { screensForTab, titleKeyForTab } from "./compartments";
import { goDeep, useDeepRoute, useZoneScreens } from "./routeStore";
import "./compartmentHeader.css";

type Props = { tab: Tab; onJump: (tab: Tab) => void };
type Item = { id: string; label: string; on: boolean; go: () => void };

export default function CompartmentHeader({ tab, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const zone = useZoneScreens();
  const deep = useDeepRoute();
  const tabScreens = screensForTab(tab);

  let items: Item[];
  let title = t(titleKeyForTab(tab));
  if (tabScreens.length > 1) {
    items = tabScreens.map((s) => ({ id: s.tab, label: t(s.labelKey), on: s.tab === tab, go: () => onJump(s.tab) }));
  } else if (zone.tab === tab && zone.screens.length) {
    const cur = deep[0]?.slug;
    items = zone.screens.map((s) => ({ id: s.slug, label: s.label, on: s.slug === cur, go: () => goDeep([s.slug]) }));
    const hit = zone.screens.find((s) => s.slug === cur);
    if (hit) title = hit.label;
  } else {
    items = tabScreens.map((s) => ({ id: s.tab, label: t(s.labelKey), on: true, go: () => onJump(s.tab) }));
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (boxRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  useEffect(() => setOpen(false), [tab]);

  return (
    <div className="cmp-header" data-testid="cmp-header">
      <div className="cmp-row">
        <h2 className="cmp-title" data-testid="cmp-title">◈ {title}</h2>
        <div className="cmp-overview-box" ref={boxRef}>
          <button
            type="button"
            className="cmp-overview"
            aria-haspopup="menu"
            aria-expanded={open}
            data-testid="cmp-overview"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPos({ left: r.left, top: r.bottom + 4 });
              setOpen((v) => !v);
            }}
          >
            {t("alt_overview")} ▾
          </button>
          {open ? createPortal(
            <ul className="cmp-menu" role="menu" ref={menuRef} style={{ left: pos.left, top: pos.top }}>
              {items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.on}
                    data-screen={s.id}
                    className={s.on ? "on" : ""}
                    onClick={() => {
                      setOpen(false);
                      s.go();
                    }}
                  >
                    <span className="cmp-check">{s.on ? "✓" : ""}</span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          ) : null}
        </div>
      </div>
      <PathCrumbs tab={tab} onJump={onJump} />
    </div>
  );
}
