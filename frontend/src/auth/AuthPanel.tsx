import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Pilot = { id: number; callsign: string; display_name: string; skin: string; xp: number };
type Honor = { callsign: string; xp: number; best_cpm: number; sessions: number };
type Mission = {
  id: string;
  title: string;
  done: boolean;
  claimed: boolean;
  progress: number;
  target: number;
  reward_xp: number;
};

export default function AuthPanel() {
  const [callsign, setCallsign] = useState("Cadet");
  const [pin, setPin] = useState("1234");
  const [me, setMe] = useState<Pilot | null>(null);
  const [honor, setHonor] = useState<Honor[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const m = await (await fetch("/api/pilots/me", { credentials: "include" })).json();
    setMe(m);
    setHonor(await (await fetch("/api/pilots/honor")).json());
    setMissions(await (await fetch("/api/missions", { credentials: "include" })).json());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const register = async () => {
    const r = await fetch("/api/pilots/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign, pin, display_name: callsign }),
    });
    setMsg(r.ok ? t("enrolled") : await r.text());
    void refresh();
  };

  const login = async () => {
    const r = await fetch("/api/pilots/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign, pin }),
    });
    setMsg(r.ok ? t("in_cabin") : t("login_fail"));
    void refresh();
  };

  const claim = async (id: string) => {
    const r = await fetch(`/api/missions/${id}/claim`, { method: "POST", credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      setMsg(`${t("reward_xp")} +${j.reward_xp} XP`);
    } else {
      setMsg(await r.text());
    }
    void refresh();
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
      if (!r.ok) {
        setMsg(`${t("import_fail")}: ${await r.text()}`);
        return;
      }
      const j = await r.json();
      const detail =
        typeof j.sessions_imported === "number"
          ? `${j.sessions_imported} sessions · XP ${j.xp}`
          : `pilots ${j.imported ?? 1}`;
      setMsg(`${t("import_ok")}: ${detail}`);
      void refresh();
    } catch (e) {
      setMsg(`${t("import_fail")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="auth">
      <div className="bridge-actions">
        <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder={t("callsign_ph")} />
        <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" type="password" />
        <button type="button" className="hud-btn" onClick={() => void register()}>
          {t("enroll")}
        </button>
        <button type="button" className="hud-btn amber" onClick={() => void login()}>
          {t("login")}
        </button>
      </div>
      <div className="bridge-actions">
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
        <button type="button" className="hud-btn" onClick={() => fileRef.current?.click()}>
          {t("import_pilot")}
        </button>
      </div>
      {me && (
        <p>
          {t("pilot_line")}: <strong>{me.callsign}</strong> · XP {me.xp} · {t("skin_label")} {me.skin}
        </p>
      )}
      {msg && <p className="muted">{msg}</p>}
      <h3>{t("missions")}</h3>
      <ul className="station-list">
        {missions.map((m) => (
          <li key={m.id}>
            {m.claimed ? "★" : m.done ? "✓" : "·"} {m.title} ({m.progress}/{m.target})
            {m.done && !m.claimed && me && (
              <button type="button" className="hud-btn amber" style={{ marginLeft: 8 }} onClick={() => void claim(m.id)}>
                +{m.reward_xp} XP
              </button>
            )}
          </li>
        ))}
      </ul>
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
    </div>
  );
}
