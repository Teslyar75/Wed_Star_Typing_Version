import { useEffect, useState } from "react";
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
    setMsg(r.ok ? "Зачислен" : await r.text());
    void refresh();
  };

  const login = async () => {
    const r = await fetch("/api/pilots/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign, pin }),
    });
    setMsg(r.ok ? "В кабине" : "Ошибка входа");
    void refresh();
  };

  const claim = async (id: string) => {
    const r = await fetch(`/api/missions/${id}/claim`, { method: "POST", credentials: "include" });
    setMsg(r.ok ? `Награда +${(await r.json()).reward_xp} XP` : await r.text());
    void refresh();
  };

  return (
    <div className="auth">
      <div className="bridge-actions">
        <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="позывной / callsign" />
        <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" type="password" />
        <button type="button" className="hud-btn" onClick={() => void register()}>
          {t("enroll")}
        </button>
        <button type="button" className="hud-btn amber" onClick={() => void login()}>
          {t("login")}
        </button>
      </div>
      {me && (
        <p>
          Пилот: <strong>{me.callsign}</strong> · XP {me.xp} · скин {me.skin}
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
