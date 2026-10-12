import { useEffect, useState } from "react";

type Pilot = { id: number; callsign: string; display_name: string; skin: string; xp: number };
type Honor = { callsign: string; xp: number; best_cpm: number; sessions: number };

export default function AuthPanel() {
  const [callsign, setCallsign] = useState("Cadet");
  const [pin, setPin] = useState("1234");
  const [me, setMe] = useState<Pilot | null>(null);
  const [honor, setHonor] = useState<Honor[]>([]);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    const m = await (await fetch("/api/pilots/me", { credentials: "include" })).json();
    setMe(m);
    setHonor(await (await fetch("/api/pilots/honor")).json());
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

  return (
    <div className="auth">
      <div className="bridge-actions">
        <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="позывной" />
        <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" type="password" />
        <button type="button" className="hud-btn" onClick={() => void register()}>
          Зачислить
        </button>
        <button type="button" className="hud-btn amber" onClick={() => void login()}>
          Войти
        </button>
      </div>
      {me && (
        <p>
          Пилот: <strong>{me.callsign}</strong> · XP {me.xp} · скин {me.skin}
        </p>
      )}
      {msg && <p className="muted">{msg}</p>}
      <h3>Доска почёта</h3>
      <table className="honor">
        <thead>
          <tr>
            <th>Пилот</th>
            <th>XP</th>
            <th>CPM</th>
            <th>Сессии</th>
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
