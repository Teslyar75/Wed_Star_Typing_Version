import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import type { Tab } from "./tabs";

type Props = {
  open: boolean;
  onClose: () => void;
  onJump: (tab: Tab) => void;
};

const ITEMS: { id: Tab; labelKey: string }[] = [
  { id: "bridge", labelKey: "bridge" },
  { id: "missions", labelKey: "missions" },
  { id: "cargo", labelKey: "own_text" },
  { id: "log", labelKey: "flight_log" },
  { id: "english", labelKey: "english" },
  { id: "speed", labelKey: "speed" },
  { id: "lounge", labelKey: "lounge" },
  { id: "radio", labelKey: "radio" },
  { id: "settings", labelKey: "settings" },
];

export default function CommandPalette({ open, onClose, onJump }: Props) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  if (!open) return null;
  const filtered = ITEMS.filter(
    (x) => t(x.labelKey).toLowerCase().includes(q.toLowerCase()) || x.id.includes(q.toLowerCase()),
  );
  return createPortal(
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div
        className="cmd-palette"
        role="dialog"
        aria-label={t("command_palette")}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`${t("command_palette")}…`}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered[0]) {
              onJump(filtered[0].id);
              onClose();
            }
          }}
        />
        <ul>
          {filtered.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  onJump(x.id);
                  onClose();
                }}
              >
                {t(x.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
