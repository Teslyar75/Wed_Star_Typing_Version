/** Экран выбора пилота — эталон screenshots/pilots/01_login.png */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import PinDialog from "./PinDialog";

export type RosterCard = {
  id: number;
  callsign: string;
  display_name: string;
  accent: string;
  skin: string;
  xp: number;
  xp_lo: number;
  xp_hi: number | null;
  rank: string;
  avatar_data?: string;
  is_guest?: boolean;
  has_pin?: boolean;
  best_cpm: number;
  sessions: number;
  last_at?: string | null;
};

type Props = {
  mode?: "settings" | "gate";
  onEntered?: (p: { callsign: string; rank?: string; xp?: number; xp_next?: number }) => void;
  onExit?: () => void;
};

const ASK_KEY = "st_ask_crew_on_start";
const RECENT_KEY = "st_recent_callsigns";

function rememberCallsign(cs: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as unknown;
    const prev = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    localStorage.setItem(RECENT_KEY, JSON.stringify([cs, ...prev.filter((x) => x !== cs)].slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function formatLast(iso: string | null | undefined): string {
  if (!iso) return t("crew_last_never");
  try {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return t("crew_last_today");
    return d.toLocaleDateString();
  } catch {
    return t("crew_last_never");
  }
}

function emblem(accent: string): string {
  const map: Record<string, string> = { cyan: "★", amber: "☄", green: "⚡", purple: "◎", magenta: "✦" };
  return map[accent] || "★";
}

export default function AuthPanel({ mode = "settings", onEntered, onExit }: Props) {
  const [roster, setRoster] = useState<RosterCard[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [needPin, setNeedPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [callsign, setCallsign] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState("");
  const [askStart, setAskStart] = useState(() => localStorage.getItem(ASK_KEY) !== "0");
  const [showHonor, setShowHonor] = useState(false);
  const [honor, setHonor] = useState<{ callsign: string; xp: number; best_cpm: number; sessions: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = roster.find((p) => p.id === sel) ?? null;

  const refresh = useCallback(async () => {
    const [listRes, meRes] = await Promise.all([
      fetch("/api/pilots/roster", { credentials: "include" }),
      fetch("/api/pilots/me", { credentials: "include" }),
    ]);
    const list = (await listRes.json()) as RosterCard[];
    const me = meRes.ok ? await meRes.json() : null;
    const cards = Array.isArray(list) ? list : [];
    setRoster(cards);
    setMeId(me?.id != null ? (me.id as number) : null);
    setSel((cur) => {
      if (cur != null && cards.some((p) => p.id === cur)) return cur;
      if (me?.id != null) return me.id as number;
      return cards[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showHonor) return;
    void (async () => {
      const rows = await (await fetch("/api/pilots/honor")).json();
      setHonor(Array.isArray(rows) ? rows : []);
    })();
  }, [showHonor]);

  const finishEnter = (p: RosterCard) => {
    rememberCallsign(p.callsign);
    setNeedPin(false);
    setMsg(t("in_cabin"));
    onEntered?.({ callsign: p.callsign, rank: p.rank, xp: p.xp, xp_next: p.xp_hi ?? undefined });
    void refresh();
    if (mode === "gate") onExit?.();
  };

  const enterCabin = async (card?: RosterCard | null) => {
    const p = card ?? selected;
    if (!p) return;
    if (p.has_pin && meId !== p.id) {
      setNeedPin(true);
      setMsg("");
      return;
    }
    const r = await fetch("/api/pilots/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign: p.callsign, pin: "" }),
    });
    if (!r.ok) {
      setMsg(t("login_fail"));
      return;
    }
    finishEnter(p);
  };

  const submitPin = async (code: string): Promise<boolean> => {
    if (!selected) return false;
    setPinBusy(true);
    try {
      const r = await fetch("/api/pilots/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign: selected.callsign, pin: code }),
      });
      if (!r.ok) return false;
      finishEnter(selected);
      return true;
    } finally {
      setPinBusy(false);
    }
  };

  const forgotPin = async () => {
    if (!selected) return;
    const cs = window.prompt(t("pin_forgot_prompt").replace("{0}", selected.callsign), "");
    if (cs == null) return;
    const r = await fetch(`/api/pilots/${selected.id}/clear-pin`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign: cs }),
    });
    if (!r.ok) {
      setMsg(t("pin_forgot_fail"));
      return;
    }
    setNeedPin(false);
    setMsg(t("pin_forgot_ok"));
    void refresh();
  };

  const enroll = async () => {
    const cs = callsign.trim();
    if (cs.length < 2) {
      setMsg(t("callsign_ph"));
      return;
    }
    const r = await fetch("/api/pilots/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign: cs, pin: newPin, display_name: cs }),
    });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = (await r.json()) as { id: number; callsign: string; xp?: number };
    setEnrollOpen(false);
    setCallsign("");
    setNewPin("");
    setMsg(t("enrolled"));
    rememberCallsign(j.callsign);
    onEntered?.({ callsign: j.callsign, xp: j.xp });
    await refresh();
    setSel(j.id);
    if (mode === "gate") onExit?.();
  };

  const dismiss = async () => {
    if (!selected) return;
    if (!window.confirm(`${t("crew_dismiss")} «${selected.callsign}»?`)) return;
    const r = await fetch(`/api/pilots/${selected.id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    setSel(null);
    setMsg("");
    void refresh();
  };

  const exportStpilot = async () => {
    const r = await fetch("/api/pilots/me/export", { credentials: "include" });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    const j = await r.json();
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${j.callsign || "pilot"}.stpilot.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const path = Array.isArray(raw.pilots) ? "/api/migrate/bundle" : "/api/migrate/pilot";
      const r = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      setMsg(r.ok ? t("import_ok") : `${t("import_fail")}: ${await r.text()}`);
      void refresh();
    } catch (e) {
      setMsg(`${t("import_fail")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enrollOpen || needPin) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!roster.length) return;
        e.preventDefault();
        const ids = roster.map((p) => p.id);
        const i = Math.max(0, ids.indexOf(sel ?? ids[0]!));
        const next = e.key === "ArrowRight" ? (i + 1) % ids.length : (i - 1 + ids.length) % ids.length;
        setSel(ids[next]!);
        setNeedPin(false);
      }
      if (e.key === "Enter" && selected) {
        e.preventDefault();
        void enterCabin(selected);
      }
      if (e.key === "Insert") {
        e.preventDefault();
        setEnrollOpen(true);
      }
      if ((e.key === "Delete" || e.key === "Del") && selected) {
        e.preventDefault();
        void dismiss();
      }
      if (e.key === "Escape" && mode === "gate") {
        e.preventDefault();
        onExit?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, sel, selected, enrollOpen, needPin, mode]);

  const xpFrac = (p: RosterCard) => {
    const hi = p.xp_hi ?? p.xp + 1;
    const span = Math.max(1, hi - p.xp_lo);
    return Math.max(0, Math.min(100, ((p.xp - p.xp_lo) / span) * 100));
  };

  return (
    <section className={`crew-gate ${mode === "gate" ? "is-gate" : ""}`}>
      <header className="crew-gate-head">
        <div>
          <div className="brand-sub crew-gate-sub">{t("crew_enter_cabin")}</div>
          <h2 className="route-title">{t("crew_pick_pilot")}</h2>
          <p className="muted crew-gate-hints">{t("crew_hotkeys")}</p>
        </div>
        <div className="crew-gate-tools">
          <span className="muted">{t("crew_count").replace("{0}", String(roster.length))}</span>
          <button type="button" className="hud-btn" onClick={() => setShowHonor((v) => !v)}>
            ★ {t("honor")}
          </button>
        </div>
      </header>

      {msg ? <p className="mission-map-hint">{msg}</p> : null}

      {showHonor ? (
        <div className="crew-honor inst-panel">
          <h3>{t("honor")}</h3>
          <table className="honor">
            <thead>
              <tr>
                <th>{t("pilot")}</th>
                <th>XP</th>
                <th>CPM</th>
                <th>{t("sessions")}</th>
              </tr>
            </thead>
            <tbody>
              {honor.map((h) => (
                <tr key={h.callsign}>
                  <td>{h.callsign}</td>
                  <td>{h.xp}</td>
                  <td>{Math.round(h.best_cpm)}</td>
                  <td>{h.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="hud-btn" onClick={() => setShowHonor(false)}>
            {t("close")}
          </button>
        </div>
      ) : null}

      <div className="crew-cards" role="list">
        {roster.map((p) => {
          const on = p.id === sel;
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className={`crew-card tone-${p.accent || "cyan"} ${on ? "on" : ""}`}
              onClick={() => {
                setSel(p.id);
                setNeedPin(false);
                setMsg("");
              }}
              onDoubleClick={() => void enterCabin(p)}
            >
              {on ? <span className="crew-picked">▶ {t("crew_selected")}</span> : null}
              {p.has_pin ? <span className="crew-lock">🔒</span> : null}
              <div className="crew-emblem" aria-hidden>
                {p.avatar_data ? <img src={p.avatar_data} alt="" /> : <span>{emblem(p.accent)}</span>}
              </div>
              <strong className="crew-name">{p.callsign}</strong>
              {p.display_name && p.display_name !== p.callsign ? (
                <span className="muted crew-dn">{p.display_name}</span>
              ) : null}
              <div className="crew-rank">★ {p.rank}</div>
              <div className="crew-xp-bar" aria-hidden>
                <div style={{ width: `${xpFrac(p)}%` }} />
              </div>
              <div className="crew-xp-lab muted">
                {p.xp}
                {p.xp_hi != null ? ` / ${p.xp_hi}` : ""} XP
              </div>
              <ul className="crew-stats">
                <li>
                  <span>{t("crew_stat_type")}</span>
                  <strong>
                    {Math.round(p.best_cpm) || "—"} {t("cpm_unit")}
                  </strong>
                </li>
                <li>
                  <span>{t("sessions")}</span>
                  <strong>{p.sessions}</strong>
                </li>
              </ul>
              <div className="crew-last muted">
                {t("crew_last_flight")} — {formatLast(p.last_at)}
              </div>
            </button>
          );
        })}

        <button type="button" className="crew-card crew-add" onClick={() => setEnrollOpen(true)}>
          <span className="crew-add-plus">+</span>
          <span>{t("crew_enroll")}</span>
          <span className="muted">Insert</span>
        </button>
      </div>

      {needPin && selected ? (
        <PinDialog
          pilot={selected}
          purpose={t("crew_enter_cabin")}
          busy={pinBusy}
          onSubmit={submitPin}
          onCancel={() => {
            setNeedPin(false);
            setMsg("");
          }}
          onForgot={() => void forgotPin()}
        />
      ) : null}

      {enrollOpen ? (
        <div className="crew-enroll inst-panel">
          <h3>{t("crew_enroll")}</h3>
          <div className="bridge-actions">
            <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder={t("callsign_ph")} autoFocus />
            <input value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="PIN" type="password" />
            <button type="button" className="hud-btn amber" onClick={() => void enroll()}>
              {t("enroll")}
            </button>
            <button type="button" className="hud-btn" onClick={() => setEnrollOpen(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}

      <footer className="crew-gate-foot">
        <button type="button" className="hud-btn amber crew-enter" disabled={!selected} onClick={() => void enterCabin(selected)}>
          ▶ {t("crew_enter")}
          {selected ? ` · ${selected.callsign.toUpperCase()}` : ""} Enter
        </button>
        <button type="button" className="hud-btn" disabled={meId == null} onClick={() => void exportStpilot()}>
          {t("export_pilot")}
        </button>
        <button type="button" className="hud-btn" onClick={() => fileRef.current?.click()}>
          {t("import_pilot")}
        </button>
        <button type="button" className="hud-btn danger" disabled={!selected} onClick={() => void dismiss()}>
          × {t("crew_dismiss")} Del
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.stpilot"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = "";
          }}
        />
        <div className="crew-foot-right">
          {mode === "gate" ? (
            <button type="button" className="hud-btn" onClick={() => onExit?.()}>
              {t("crew_exit")} Esc
            </button>
          ) : null}
          <label className="crew-ask">
            <input
              type="checkbox"
              checked={askStart}
              onChange={(e) => {
                setAskStart(e.target.checked);
                localStorage.setItem(ASK_KEY, e.target.checked ? "1" : "0");
              }}
            />
            {t("crew_ask_start")}
          </label>
        </div>
      </footer>
    </section>
  );
}
