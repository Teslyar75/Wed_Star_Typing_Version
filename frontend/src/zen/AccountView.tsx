/** Порт stamina/account_view.py — карточка пилота, рекорды, карта 12 месяцев. */
import { useMemo, useState } from "react";
import type { PortalSummary } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtHms(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtK(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
function ordinal(n: number): string {
  const suf = n % 100 >= 10 && n % 100 <= 20 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${suf}`;
}
function blend(a: string, b: string, k: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ca = [0, 2, 4].map((i) => parseInt(pa.slice(i, i + 2), 16));
  const cb = [0, 2, 4].map((i) => parseInt(pb.slice(i, i + 2), 16));
  return "#" + ca.map((x, i) => Math.round(x + ((cb[i] ?? x) - x) * k).toString(16).padStart(2, "0")).join("");
}

type Pal = { bg: string; sub: string; subalt: string; text: string; main: string };

const SKIN_PAL: Pal = {
  bg: "var(--st-panel)",
  sub: "var(--st-muted)",
  subalt: "color-mix(in srgb, var(--st-bg) 70%, var(--st-panel))",
  text: "var(--st-text)",
  main: "var(--st-accent)",
};

export default function AccountView({
  summary,
  empty,
  pal,
  onNameClick,
}: {
  summary: PortalSummary | null | undefined;
  empty?: string;
  pal?: Pal;
  onNameClick?: () => void;
}) {
  const p = pal || SKIN_PAL;
  const [tip, setTip] = useState<string>("");
  const s = summary;
  const heat = useMemo(() => {
    const act = s?.activity || [];
    if (!act.length) return null;
    const first = new Date(act[0]![0] + "T00:00:00");
    const pad = (first.getDay() + 6) % 7; /* monday=0 like desktop weekday() */
    const weeks = Math.ceil((act.length + pad) / 7);
    const mx = Math.max(1, ...act.map((x) => x[1]));
    const tot = act.reduce((a, x) => a + x[1], 0);
    const shades = [0.25, 0.45, 0.7, 1].map((k) => blend("#2c2e31", "#e2b714", k));
    const emptyC = blend("#2c2e31", "#323437", 0.6);
    const both = s?.both || {};
    const cells: { day: string; v: number; both?: [number, number]; col: string; kx: number }[] = act.map(([day, v], i) => {
      const q = v / mx;
      const col = v ? shades[q < 0.15 ? 0 : q < 0.4 ? 1 : q < 0.7 ? 2 : 3]! : emptyC;
      return { day, v, both: both[day], col, kx: i + pad };
    });
    return { weeks, tot, cells, pad, emptyC, shades };
  }, [s]);

  if (!s) {
    return <p className="mt-empty">{empty || ""}</p>;
  }
  const joined = s.joined ? new Date(Number(s.joined) * 1000) : null;
  const jtxt = joined ? `Joined ${joined.getDate()} ${MONTHS[joined.getMonth()]} ${joined.getFullYear()}` : "";
  const secs = s.seconds ?? (s.hours || 0) * 3600;
  const need = Math.max(1, s.level_need || 1);
  const k = Math.max(0, Math.min(1, (s.level_have || 0) / need));
  const lbs = (s.lbs || []).filter((lb) => lb.mode === "time").slice(0, 2);
  const pbsOf = (mode: string) => (s.pbs || []).filter((pb) => pb.mode === mode);

  return (
    <div className="mt-acct" style={{ ["--mt-main" as string]: p.main }}>
      <article className="mt-card mt-pilot">
        <div className="mt-avatar" aria-hidden />
        <div className="mt-pilot-meta">
          <button type="button" className="mt-name" onClick={onNameClick}>
            {s.name || "—"}
          </button>
          <div className="mt-sub">{jtxt}</div>
          <div className="mt-sub">Current streak {s.streak || 0} days</div>
          <div className="mt-lvl">
            <span>{s.level || 1}</span>
            <i className="mt-bar">
              <b style={{ width: `${k * 100}%` }} />
            </i>
            <em>
              {fmtK(s.level_have || 0)}/{fmtK(need)}
            </em>
          </div>
        </div>
        <div className="mt-stats">
          {[
            ["tests started", String(s.started || 0)],
            ["tests completed", String(s.tests || 0)],
            ["time typing", fmtHms(secs)],
          ].map(([cap, val]) => (
            <div key={cap}>
              <span>{cap}</span>
              <strong>{val}</strong>
            </div>
          ))}
        </div>
      </article>

      {lbs.length > 0 && (
        <article className="mt-card mt-lbs">
          <span className="mt-sub">All-Time English Leaderboards</span>
          <div className="mt-lbs-cols">
            {lbs.map((lb) => (
              <div key={String(lb.mode2)}>
                <span className="mt-sub">{lb.mode2} seconds</span>
                {lb.count ? <em>Top {((lb.rank / lb.count) * 100).toFixed(2)}%</em> : null}
                <strong>{ordinal(lb.rank)}</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      <div className="mt-pbs">
        {(["time", "words"] as const).map((mode) => (
          <article key={mode} className="mt-card mt-pb">
            {pbsOf(mode).map((pb) => (
              <div key={`${mode}-${pb.mode2}`} className="mt-pb-cell">
                {pb.src ? <i className="mt-src">{pb.src}</i> : null}
                <span className="mt-sub">
                  {pb.mode2} {mode === "time" ? "seconds" : "words"}
                </span>
                <strong>{pb.wpm == null ? "—" : Math.round(pb.wpm)}</strong>
                <em>{pb.acc == null ? "—" : `${Math.round(pb.acc)}%`}</em>
              </div>
            ))}
          </article>
        ))}
      </div>

      {heat && (
        <article className="mt-card mt-heat">
          <header>
            <span className="mt-heat-lab">last 12 months</span>
            <span className="mt-sub">{heat.tot} tests</span>
            <span className="mt-heat-leg">
              less
              {[heat.emptyC, ...heat.shades].map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
              more
            </span>
          </header>
          <div className="mt-heat-grid" style={{ gridTemplateColumns: `auto repeat(${heat.weeks}, 1fr)` }}>
            {["monday", "", "wednesday", "", "friday", "", "sunday"].map((lab, row) => (
              <span key={row} className="mt-heat-dow" style={{ gridColumn: 1, gridRow: row + 2 }}>
                {lab}
              </span>
            ))}
            {heat.cells.map((c) => {
              const col = Math.floor(c.kx / 7) + 2;
              const row = (c.kx % 7) + 2;
              const title = `${c.day}: ${c.v} tests${c.both ? `  (ST ${c.both[0]} · MT ${c.both[1]})` : ""}`;
              return (
                <i
                  key={c.day}
                  className="mt-heat-cell"
                  style={{ gridColumn: col, gridRow: row, background: c.col }}
                  title={title}
                  onMouseEnter={() => setTip(title)}
                  onMouseLeave={() => setTip("")}
                />
              );
            })}
          </div>
          {tip ? <div className="mt-tip">{tip}</div> : null}
        </article>
      )}
    </div>
  );
}
