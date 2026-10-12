import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Pilot = {
  id: number;
  callsign: string;
  display_name: string;
  skin: string;
  xp: number;
  avatar_data?: string;
  is_guest?: boolean;
};
type Dossier = {
  sessions: number;
  best_cpm: number;
  avg_cpm: number;
  books_on_shelf: number;
  english_reviews: number;
  english_cards: number;
  speed_runs: number;
  xp: number;
  is_guest: boolean;
};
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

const RECENT_KEY = "st_recent_callsigns";

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function rememberCallsign(cs: string) {
  const next = [cs, ...loadRecent().filter((x) => x !== cs)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function AuthPanel() {
  const [callsign, setCallsign] = useState("Cadet");
  const [pin, setPin] = useState("1234");
  const [me, setMe] = useState<Pilot | null>(null);
  const [honor, setHonor] = useState<Honor[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const m = await (await fetch("/api/pilots/me", { credentials: "include" })).json();
    setMe(m);
    if (m?.callsign) {
      rememberCallsign(m.callsign);
      setRecent(loadRecent());
    }
    setHonor(await (await fetch("/api/pilots/honor")).json());
    setMissions(await (await fetch("/api/missions", { credentials: "include" })).json());
    if (m?.id) {
      const d = await fetch("/api/pilots/dossier", { credentials: "include" });
      setDossier(d.ok ? await d.json() : null);
    } else setDossier(null);
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

  const logout = async () => {
    await fetch("/api/pilots/logout", { method: "POST", credentials: "include" });
    setMe(null);
    setDossier(null);
    setMsg(t("logout_ok"));
  };

  const guest = async () => {
    const r = await fetch("/api/pilots/guest", { method: "POST", credentials: "include" });
    setMsg(r.ok ? `${t("guest_mode")} — ${t("guest_warn")}` : await r.text());
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
    setMsg(t("export_ok"));
  };

  const uploadAvatar = async (file: File | null) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/pilots/me/avatar", { method: "POST", credentials: "include", body: fd });
    setMsg(r.ok ? t("avatar_ok") : await r.text());
    void refresh();
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
        <button type="button" className="hud-btn" onClick={() => void guest()}>
          {t("guest_mode")}
        </button>
        {me && (
          <button type="button" className="hud-btn" onClick={() => void logout()}>
            {t("logout")}
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <div className="bridge-actions">
          <span className="muted">{t("recent_pilots")}:</span>
          {recent.map((cs) => (
            <button key={cs} type="button" className="hud-btn" onClick={() => setCallsign(cs)}>
              {cs}
            </button>
          ))}
        </div>
      )}

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
        {me && (
          <>
            <button type="button" className="hud-btn" onClick={() => void exportStpilot()}>
              {t("export_pilot")}
            </button>
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void uploadAvatar(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button type="button" className="hud-btn" onClick={() => avatarRef.current?.click()}>
              {t("avatar_upload")}
            </button>
          </>
        )}
      </div>

      {me && (
        <div className="pilot-dossier">
          {me.avatar_data ? (
            <img className="pilot-avatar" src={me.avatar_data} alt="" width={256} height={256} style={{ maxWidth: 96, height: "auto" }} />
          ) : (
            <div className="pilot-avatar placeholder">★</div>
          )}
          <p>
            {t("pilot_line")}: <strong>{me.callsign}</strong> · XP {me.xp} · {t("skin_label")} {me.skin}
            {me.is_guest ? ` · ${t("guest_mode")}` : ""}
          </p>
          {dossier && (
            <p className="muted">
              {t("dossier")}: {dossier.sessions} sess · CPM {Math.round(dossier.best_cpm)} · {dossier.books_on_shelf}{" "}
              books · EN {dossier.english_reviews}/{dossier.english_cards} · speed {dossier.speed_runs}
            </p>
          )}
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
      <div
        className="drop-zone muted"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void importJson(f);
        }}
      >
        .stpilot drag & drop
      </div>
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
