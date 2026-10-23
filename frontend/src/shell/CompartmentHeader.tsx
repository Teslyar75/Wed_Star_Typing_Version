/** Шапка отсека (alt): строка «◈ Заголовок [ОБЗОР ▾]» + крошки. Эталон: docs/ALT_UI.md. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import type { Tab } from "./tabs";
import PathCrumbs from "./PathCrumbs";
import { screensForTab, titleKeyForTab } from "./compartments";
import "./compartmentHeader.css";

type Props = { tab: Tab; onJump: (tab: Tab) => void };

export default function CompartmentHeader({ tab, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const screens = screensForTab(tab);

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
        <h2 className="cmp-title">◈ {t(titleKeyForTab(tab))}</h2>
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
              {screens.map((s) => (
                <li key={s.tab}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.tab === tab}
                    className={s.tab === tab ? "on" : ""}
                    onClick={() => {
                      setOpen(false);
                      onJump(s.tab);
                    }}
                  >
                    <span className="cmp-check">{s.tab === tab ? "✓" : ""}</span>
                    {t(s.labelKey)}
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
