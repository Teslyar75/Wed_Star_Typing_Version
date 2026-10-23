import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ORION_CALL_EVENT } from "../guide/OrionCallButton";
import { t } from "../i18n";
import type { Tab } from "./tabs";

type Props = {
  open: boolean;
  onClose: () => void;
  onJump: (tab: Tab) => void;
};

type Item =
  | { kind: "tab"; id: Tab; labelKey: string; search: string }
  | { kind: "action"; id: "orion"; labelKey: string; search: string };

const ITEMS: Item[] = [
  { kind: "action", id: "orion", labelKey: "call_orion", search: "orion орион home" },
  { kind: "tab", id: "bridge", labelKey: "bridge", search: "bridge" },
  { kind: "tab", id: "missions", labelKey: "missions", search: "missions" },
  { kind: "tab", id: "cargo", labelKey: "own_text", search: "cargo" },
  { kind: "tab", id: "log", labelKey: "flight_log", search: "log" },
  { kind: "tab", id: "bridgeSettings", labelKey: "bridge_settings", search: "bridgeSettings" },
  { kind: "tab", id: "english", labelKey: "english", search: "english" },
  { kind: "tab", id: "speed", labelKey: "speed", search: "speed" },
  { kind: "tab", id: "lounge", labelKey: "lounge", search: "lounge" },
  { kind: "tab", id: "radio", labelKey: "radio", search: "radio" },
  { kind: "tab", id: "settings", labelKey: "settings", search: "settings" },
];

function runItem(x: Item, onJump: (tab: Tab) => void, onClose: () => void) {
  if (x.kind === "action" && x.id === "orion") {
    window.dispatchEvent(new Event(ORION_CALL_EVENT));
    onClose();
    return;
  }
  if (x.kind === "tab") {
    onJump(x.id);
    onClose();
  }
}

export default function CommandPalette({ open, onClose, onJump }: Props) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  if (!open) return null;
  const qq = q.toLowerCase();
  const filtered = ITEMS.filter(
    (x) => t(x.labelKey).toLowerCase().includes(qq) || x.search.toLowerCase().includes(qq),
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
            if (e.key === "Enter" && filtered[0]) runItem(filtered[0], onJump, onClose);
          }}
        />
        <ul>
          {filtered.map((x) => (
            <li key={x.id}>
              <button type="button" className="hud-btn" onClick={() => runItem(x, onJump, onClose)}>
                {t(x.labelKey)}
                {x.kind === "action" ? "  ·  Home" : ""}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
