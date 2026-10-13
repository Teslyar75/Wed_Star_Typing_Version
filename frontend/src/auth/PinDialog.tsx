/** Модалка кода доступа — порт stamina/pilot_screens.PinDialog + PinPad. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";

const MAX_LEN = 8;
const MAX_TRIES = 5;

type PilotLike = {
  callsign: string;
  accent?: string;
  avatar_data?: string;
};

type Props = {
  pilot: PilotLike;
  purpose?: string;
  busy?: boolean;
  onSubmit: (code: string) => Promise<boolean>;
  onCancel: () => void;
  onForgot?: () => void;
};

export default function PinDialog({
  pilot,
  purpose,
  busy = false,
  onSubmit,
  onCancel,
  onForgot,
}: Props) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [flash, setFlash] = useState(false);
  const [left, setLeft] = useState(MAX_TRIES);
  const [lockedUntil, setLockedUntil] = useState(0);

  const cells = Math.max(4, code.length || 4);

  const press = useCallback((k: string) => {
    if (Date.now() < lockedUntil) return;
    setFlash(false);
    if (k === "⌫") {
      setCode((c) => c.slice(0, -1));
      return;
    }
    if (k === "✓") return;
    if (/^\d$/.test(k)) {
      setCode((c) => (c.length < MAX_LEN ? c + k : c));
    }
  }, [lockedUntil]);

  const submit = useCallback(async () => {
    if (Date.now() < lockedUntil || busy) return;
    if (code.length < 4) {
      setMsg(t("pin_need_digits"));
      return;
    }
    const ok = await onSubmit(code);
    if (ok) return;
    const next = Math.max(0, left - 1);
    setLeft(next);
    setFlash(true);
    setCode("");
    if (next <= 0) {
      const until = Date.now() + 30_000;
      setLockedUntil(until);
      setLeft(MAX_TRIES);
      setMsg(t("pin_locked").replace("{0}", "30"));
      window.setTimeout(() => {
        setLockedUntil(0);
        setMsg("");
      }, 30_000);
    } else {
      setMsg(t("pin_wrong").replace("{0}", String(next)));
      window.setTimeout(() => setFlash(false), 600);
    }
  }, [busy, code, left, lockedUntil, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        press("⌫");
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, press, submit]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"] as const;
  const locked = Date.now() < lockedUntil;

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-label={t("pin_title")}>
      <div className="pin-modal inst-panel">
        <header className="pin-modal-head">
          <div className={`pin-av tone-${pilot.accent || "cyan"}`} aria-hidden>
            {pilot.avatar_data ? <img src={pilot.avatar_data} alt="" /> : <span>★</span>}
          </div>
          <div>
            <strong className="pin-cs">{pilot.callsign}</strong>
            <p className="pin-purpose">
              {(purpose || t("crew_enter_cabin")).toUpperCase()} · {t("pin_enter_code")}
            </p>
          </div>
        </header>

        <div className="pin-cells" aria-hidden>
          {Array.from({ length: cells }, (_, i) => (
            <span
              key={i}
              className={`pin-cell ${i < code.length ? "filled" : ""} ${flash ? "flash" : ""}`}
            >
              {i < code.length ? <i /> : null}
            </span>
          ))}
        </div>

        <div className="pin-pad">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              className={`pin-key ${k === "✓" ? "ok" : ""} ${k === "⌫" ? "back" : ""}`}
              disabled={locked || busy}
              onClick={() => (k === "✓" ? void submit() : press(k))}
            >
              {k}
            </button>
          ))}
        </div>

        {msg ? <p className="pin-msg">{msg}</p> : <p className="pin-msg muted">&nbsp;</p>}

        <div className="pin-actions">
          <button type="button" className="hud-btn amber" disabled={locked || busy} onClick={() => void submit()}>
            ✓ {t("pin_login")} Enter
          </button>
          <button type="button" className="hud-btn" onClick={onCancel}>
            {t("pin_cancel")} Esc
          </button>
        </div>

        {onForgot ? (
          <button type="button" className="pin-forgot" onClick={onForgot}>
            {t("pin_forgot")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
