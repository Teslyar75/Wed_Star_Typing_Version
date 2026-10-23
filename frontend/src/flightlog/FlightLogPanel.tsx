/** Бортжурнал — паритет stamina/screens.LogScreen. */
import { useCallback, useEffect, useMemo, useState } from "react";
import Heatmap, { type KeyRate } from "../bridge/Heatmap";
import { colorFor } from "../bridge/heatmapColor";
import { t, getLang } from "../i18n";
import { skinRank } from "../theme/voice";
import AccountView from "../zen/AccountView";
import { useMt } from "../zen/mtStore";
import { zt } from "../zen/zenI18n";
import "../zen/zen.css";

type Summary = {
  flights: number;
  total_time: number;
  total_chars: number;
  best_cpm: number;
  avg_cpm_10: number;
  avg_acc_10: number;
  xp: number;
  rank: string;
  xp_next: number | null;
  xp_to_next: number | null;
  missions_done: number;
  missions_total: number;
  mission_stars: number;
  runs: { cpm: number; acc: number; chars: number; elapsed: number }[];
};

type Props = {
  onOpenBridge?: () => void;
  onOpenHonor?: () => void;
};

const PENDING_KEY = "st_pending_drill";

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function isCyrillic(ch: string): boolean {
  return /[а-яёіїєґ]/i.test(ch);
}

function DynamicsChart({ runs }: { runs: Summary["runs"] }) {
  const w = 640;
  const h = 140;
  const pad = 12;
  if (!runs.length) {
    return <p className="muted flog-chart-empty">{t("flog_no_runs")}</p>;
  }
  const maxCpm = Math.max(120, ...runs.map((r) => r.cpm), 1);
  const xs = runs.map((_, i) => pad + (i / Math.max(1, runs.length - 1)) * (w - pad * 2));
  const yCpm = (v: number) => h - pad - (v / maxCpm) * (h - pad * 2);
  const yAcc = (v: number) => h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2);
  const line = (ys: number[]) => ys.map((y, i) => `${i === 0 ? "M" : "L"}${xs[i]},${y}`).join(" ");
  return (
    <svg
      className="flog-chart"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t("flog_dynamics")}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={pad}
          x2={w - pad}
          y1={pad + f * (h - pad * 2)}
          y2={pad + f * (h - pad * 2)}
          className="flog-grid"
        />
      ))}
      <path d={line(runs.map((r) => yCpm(r.cpm)))} className="flog-line-cpm" fill="none" />
      <path d={line(runs.map((r) => yAcc(r.acc)))} className="flog-line-acc" fill="none" />
      <text x={pad} y={14} className="flog-legend cpm">
        {t("flog_legend_cpm")}
      </text>
      <text x={w - pad} y={14} textAnchor="end" className="flog-legend acc">
        {t("flog_legend_acc")}
      </text>
    </svg>
  );
}

export default function FlightLogPanel({ onOpenBridge, onOpenHonor }: Props) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [keys, setKeys] = useState<KeyRate[]>([]);
  const [heatLang, setHeatLang] = useState<"en" | "de" | "ru" | "uk">("en");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [sRes, kRes] = await Promise.all([
      fetch("/api/sessions/summary", { credentials: "include" }),
      fetch("/api/missions/key-errors?limit=48", { credentials: "include" }),
    ]);
    if (sRes.ok) setSum(await sRes.json());
    else setSum(null);
    if (kRes.ok) setKeys(await kRes.json());
    else setKeys([]);
  }, []);

  /* Monkeytype: тихое автообновление при открытии журнала (общий троттлинг 5 мин) */
  useEffect(() => {
    void useMt.getState().sync();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const weak = useMemo(() => {
    const filtered = keys.filter((k) => {
      if (!k.key || !/[a-zа-яёіїєґ0-9]/i.test(k.key)) return false;
      if (heatLang === "ru" || heatLang === "uk") return isCyrillic(k.key);
      return !isCyrillic(k.key);
    });
    return filtered.slice(0, 12);
  }, [keys, heatLang]);

  const cards = useMemo(() => {
    if (!sum) return [];
    const rankSub = [
      `${sum.xp} XP`,
      sum.xp_to_next != null ? t("flog_to_next").replace("{0}", String(sum.xp_to_next)) : null,
      t("flog_missions")
        .replace("{0}", String(sum.missions_done))
        .replace("{1}", String(sum.missions_total))
        .replace("{2}", String(sum.mission_stars)),
    ]
      .filter(Boolean)
      .join(" · ");
    return [
      {
        cap: t("flog_time"),
        val: fmtTime(sum.total_time),
        sub: t("flog_flights").replace("{0}", String(sum.flights)),
        tone: "cyan",
      },
      {
        cap: t("flog_chars"),
        val: fmtInt(sum.total_chars),
        sub: t("flog_chars_sub"),
        tone: "cyan",
      },
      {
        cap: t("flog_best"),
        val: String(Math.round(sum.best_cpm)),
        sub: t("flog_avg_cpm").replace("{0}", String(Math.round(sum.avg_cpm_10))),
        tone: "ok",
      },
      {
        cap: t("flog_acc"),
        val: `${sum.avg_acc_10.toFixed(1)}%`,
        sub: t("flog_acc_sub"),
        tone: "amber",
      },
      {
        cap: t("flog_rank"),
        val: skinRank(sum.rank, getLang()).toUpperCase(),
        sub: rankSub,
        tone: "amber",
      },
    ];
  }, [sum]);

  const launchRepair = async () => {
    setBusy(true);
    try {
      const weakKeys = weak.map((w) => w.key);
      const r = await fetch("/api/missions/repair/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: heatLang, weak: weakKeys }),
      });
      if (!r.ok) return;
      const j = await r.json();
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: "repair", text: j.text, lang: heatLang }));
      onOpenBridge?.();
    } finally {
      setBusy(false);
    }
  };

  const resetStats = async () => {
    if (!window.confirm(t("flog_reset_confirm"))) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sessions/reset", { method: "POST", credentials: "include" });
      if (r.ok) await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flog flog-scroll">
      <header className="flog-head">
        <h2 className="route-title">{t("flog_title")}</h2>
        <button type="button" className="hud-btn amber" onClick={() => onOpenHonor?.()}>
          ★ {t("honor")}
        </button>
      </header>

      <div className="flog-cards">
        {cards.map((c) => (
          <aside key={c.cap} className={`inst-panel flog-card tone-${c.tone}`}>
            <div className="lab">{c.cap}</div>
            <strong className="flog-val">{c.val}</strong>
            <div className="muted flog-sub">{c.sub}</div>
          </aside>
        ))}
      </div>

      <section className="inst-panel flog-dynamics">
        <h3>{t("flog_dynamics")}</h3>
        <DynamicsChart runs={sum?.runs ?? []} />
      </section>

      <div className="flog-bottom">
        <section className="inst-panel flog-heat tone-amber">
          <h3>{t("flog_heatmap")}</h3>
          <Heatmap
            rates={keys}
            lang={heatLang === "uk" ? "ru" : heatLang === "de" ? "en" : heatLang}
            showTitle={false}
          />
          <div className="flog-heat-row">
            {([
              ["en", "EN"],
              ["de", "DE"],
              ["ru", "RU"],
              ["uk", "UA"],
            ] as const).map(([code, label]) => (
              <button
                key={code}
                type="button"
                className={`hud-btn ${heatLang === code ? "on" : ""}`}
                onClick={() => setHeatLang(code)}
              >
                {label}
              </button>
            ))}
            <span className="muted flog-heat-hint">{t("flog_heat_hint")}</span>
          </div>
        </section>

        <aside className="inst-panel flog-weak">
          <h3>{t("flog_weak")}</h3>
          {weak.length ? (
            <ul className="flog-weak-list">
              {weak.map((w) => {
                const heat = colorFor(w.rate) ?? "#FFB000";
                return (
                  <li key={w.key}>
                    <span
                      className="key flog-weak-cap"
                      style={
                        {
                          /* плотная заливка — иначе сквозь стекло виден только космос */
                          "--st-frame-fill": `color-mix(in srgb, ${heat} 78%, var(--st-panel))`,
                          "--st-frame-glow": heat,
                          "--st-frame-line": heat,
                          color: "#f4f7fb",
                        } as Record<string, string>
                      }
                      title={`${w.errors}/${w.hits + w.errors}`}
                    >
                      {w.key}
                    </span>
                    <strong className="flog-weak-pct">{(w.rate * 100).toFixed(1)}%</strong>
                    <span className="muted flog-weak-hits">
                      ({w.errors} {t("flog_of")} {w.hits + w.errors})
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{t("flog_weak_empty")}</p>
          )}
          <button type="button" className="hud-btn amber" disabled={busy} onClick={() => void launchRepair()}>
            ⚙ {t("flog_repair")}
          </button>
          <button type="button" className="hud-btn danger" disabled={busy} onClick={() => void resetStats()}>
            {t("flog_reset")}
          </button>
        </aside>
      </div>

      <section className="zen-embed flog-mt" data-testid="flog-mt">
        <h3 className="zen-embed-title">{zt("journal_table")}</h3>
        <AccountView />
      </section>
    </section>
  );
}
