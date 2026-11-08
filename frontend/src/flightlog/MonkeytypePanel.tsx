/** Панель MONKEYTYPE в бортжурнале — порт stamina/mt_panel.py (только чтение API). */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import AccountView from "../zen/AccountView";
import type { PortalPack } from "../zen/types";

function fmtWhen(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}

export default function MonkeytypePanel() {
  const [pack, setPack] = useState<PortalPack | null>(null);
  const [user, setUser] = useState("");
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyDirty = useRef(false);
  const userRef = useRef(user);
  const keyRef = useRef(key);
  userRef.current = user;
  keyRef.current = key;

  const apply = (p: PortalPack) => {
    setPack(p);
    setUser(p.username || "");
    if (!keyDirty.current) setKey(p.has_key ? "••••••••" : "");
    const when = p.fetched_at ? t("mt_updated").replace("{0}", fmtWhen(p.fetched_at)) : "";
    const w = p.warning || "";
    setStatus((w ? w + " · " : "") + when);
    setWarn(!!w);
  };

  const load = useCallback(async () => {
    const r = await fetch("/api/portal", { credentials: "include" });
    if (!r.ok) return;
    apply((await r.json()) as PortalPack);
  }, []);

  const saveCreds = useCallback(async (src?: PortalPack["src"]) => {
    const username = userRef.current.trim();
    const ape = keyRef.current;
    const keep = ape === "••••••••" || ape === "";
    const body: { username: string; apekey: string | null; src?: string } = {
      username,
      apekey: keep && !keyDirty.current ? null : ape === "••••••••" ? null : ape,
    };
    if (src) body.src = src;
    const r = await fetch("/api/portal/creds", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) apply((await r.json()) as PortalPack);
    return username;
  }, []);

  const sync = useCallback(async (force: boolean) => {
    const username = await saveCreds();
    if (!username) {
      if (force) return;
      return;
    }
    setBusy(true);
    setStatus(t("mt_loading"));
    setWarn(false);
    try {
      const r = await fetch(`/api/portal/sync?force=${force ? "true" : "false"}`, {
        method: "POST",
        credentials: "include",
      });
      const p = (await r.json().catch(() => ({}))) as PortalPack & { detail?: string };
      if (r.status === 400) {
        setStatus(t("mt_hint"));
        return;
      }
      if (!r.ok) {
        const msg = typeof p.detail === "string" ? p.detail : t("mt_empty");
        setStatus(msg);
        setWarn(true);
        return;
      }
      if (p.status === "backoff") {
        setStatus(t("mt_limit").replace("{0}", String(Math.max(1, Math.round((p.retry_in || 0) / 60)))));
        setWarn(true);
        apply(p);
        return;
      }
      apply(p);
    } finally {
      setBusy(false);
    }
  }, [saveCreds]);

  useEffect(() => {
    let stop = false;
    void (async () => {
      await load();
      if (stop) return;
      window.setTimeout(() => {
        if (stop) return;
        const username = userRef.current.trim();
        if (!username) return;
        setBusy(true);
        setStatus(t("mt_loading"));
        void fetch("/api/portal/sync?force=false", { method: "POST", credentials: "include" })
          .then(async (r) => {
            const p = (await r.json().catch(() => ({}))) as PortalPack & { detail?: string };
            if (r.status === 400) {
              setStatus(t("mt_hint"));
              return;
            }
            if (!r.ok) {
              setStatus(typeof p.detail === "string" ? p.detail : t("mt_empty"));
              setWarn(true);
              return;
            }
            if (p.status === "backoff") {
              setStatus(t("mt_limit").replace("{0}", String(Math.max(1, Math.round((p.retry_in || 0) / 60)))));
              setWarn(true);
            }
            apply(p);
          })
          .finally(() => setBusy(false));
      }, 800);
    })();
    return () => {
      stop = true;
    };
  }, [load]);

  const setSrc = async (src: PortalPack["src"]) => {
    await saveCreds(src);
  };

  const openProfile = () => {
    const name = user.trim();
    if (!name) return;
    window.open("https://monkeytype.com/profile/" + encodeURIComponent(name), "_blank", "noopener");
  };

  const src = pack?.src || "all";

  return (
    <section className="inst-panel mt-panel">
      <h3>MONKEYTYPE</h3>
      <div className="mt-row">
        <label>
          {t("mt_pilot")}
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            onBlur={() => void saveCreds()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sync(true);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label>
          {t("mt_apekey")}
          <input
            type="password"
            value={key}
            onChange={(e) => {
              keyDirty.current = true;
              setKey(e.target.value);
            }}
            onFocus={() => {
              if (key === "••••••••") {
                setKey("");
                keyDirty.current = false;
              }
            }}
            onBlur={() => void saveCreds()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sync(true);
            }}
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            name="st-mt-apekey"
          />
        </label>
        <button type="button" className="hud-btn" disabled={busy} onClick={() => void sync(true)} title="↻">
          ↻
        </button>
        <span className={`muted mt-status ${warn ? "warn" : ""}`}>{status}</span>
      </div>
      <div className="mt-tabs">
        {(["all", "st", "mt"] as const).map((k) => (
          <button key={k} type="button" className={src === k ? "on" : ""} onClick={() => void setSrc(k)}>
            {k === "all" ? t("mt_tab_all") : k === "st" ? t("mt_tab_st") : t("mt_tab_mt")}
          </button>
        ))}
      </div>
      <AccountView
        summary={pack?.summary}
        empty={pack?.username ? t("mt_empty") : t("mt_hint")}
        onNameClick={openProfile}
      />
    </section>
  );
}
