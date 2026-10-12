import { useEffect, useState } from "react";
import { t } from "../i18n";

type Tab = "bridge" | "reader" | "library" | "english" | "speed" | "auth" | "skins" | "radio" | "lounge";

type Props = {
  open: boolean;
  onClose: () => void;
  onJump: (tab: Tab) => void;
};

const ITEMS: { id: Tab; labelKey: string }[] = [
  { id: "bridge", labelKey: "bridge" },
  { id: "library", labelKey: "library" },
  { id: "reader", labelKey: "reader" },
  { id: "english", labelKey: "english" },
  { id: "speed", labelKey: "speed" },
  { id: "radio", labelKey: "radio" },
  { id: "lounge", labelKey: "lounge" },
  { id: "auth", labelKey: "crew" },
  { id: "skins", labelKey: "skins" },
];

export default function CommandPalette({ open, onClose, onJump }: Props) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  if (!open) return null;
  const filtered = ITEMS.filter((x) => t(x.labelKey).toLowerCase().includes(q.toLowerCase()) || x.id.includes(q.toLowerCase()));
  return (
    <div className="cmd-palette" role="dialog" aria-label={t("command_palette")}>
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
  );
}
