import { useEffect, useState } from "react";

type Health = { ok: boolean };
type Meta = { app: string; desktop_version: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  return (
    <div className="cockpit">
      <header className="hud-bar">
        <span className="logo">★</span>
        <h1>Star Typing Web</h1>
        <span className="badge">фаза 0</span>
      </header>
      <main className="panel">
        <p className="lead">
          Браузерный пульт Star Typing. Каркас готов — дальше по{" "}
          <code>docs/web/WEB_PLAN.md</code> (промпты 2…9).
        </p>
        <ul className="status-list">
          <li>
            API <code>/api/health</code>:{" "}
            {health?.ok ? <strong className="ok">ok</strong> : "…"}
          </li>
          <li>
            Десктоп:{" "}
            {meta ? (
              <>
                {meta.app} {meta.desktop_version}
              </>
            ) : (
              "бэкенд не запущен"
            )}
          </li>
          <li>Скин: тема «Звездолёт» через CSS-переменные из <code>packages/themes/</code></li>
        </ul>
      </main>
    </div>
  );
}
