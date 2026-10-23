/** Страница аккаунта в духе Monkeytype: карточка пилота, рекорды, карта активности за 12 месяцев. */
import { useState } from "react";
import type { PortalStats, Summary } from "./portalApi";
import { zt } from "./zenI18n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtHms = (s: number) => {
  const v = Math.floor(s);
  return `${Math.floor(v / 3600)}:${String(Math.floor((v % 3600) / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

function Activity({ s }: { s: Summary }) {
  const act = s.activity || [];
  if (!act.length) return null;
  const max = Math.max(1, ...act.map(([, v]) => v));
  const first = new Date(act[0]![0] + "T00:00:00Z");
  const pad = first.getUTCDay();
  const cells: ([string, number] | null)[] = [...Array(pad).fill(null), ...act];
  const weeks: ([string, number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const lvl = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <div className="zen-acc-card zen-activity">
      <div className="zen-act-months">
        {weeks.map((w, i) => {
          const d = w.find(Boolean);
          const show = d && d[0].endsWith("-01") || (d && Number(d[0].slice(8)) <= 7 && i > 0);
          return <span key={i}>{show && d ? MONTHS[Number(d[0].slice(5, 7)) - 1] : ""}</span>;
        })}
      </div>
      <div className="zen-act-grid">
        {weeks.map((w, i) => (
          <div key={i} className="zen-act-col">
            {w.map((c, j) =>
              c ? (
                <i key={j} className={`zen-act-c l${lvl(c[1])}`}
                  title={s.both?.[c[0]] ? zt("tooltip_day", c[0], s.both[c[0]]![0], s.both[c[0]]![1]) : `${c[0]}: ${c[1]}`} />
              ) : <i key={j} className="zen-act-c empty" />,
            )}
          </div>
        ))}
      </div>
      <div className="zen-act-legend"><span>less</span>{[0, 1, 2, 3, 4].map((l) => <i key={l} className={`zen-act-c l${l}`} />)}<span>more</span></div>
    </div>
  );
}

function Pbs({ s, mode }: { s: Summary; mode: "time" | "words" }) {
  return (
    <div className="zen-acc-card zen-pbs">
      {s.pbs.filter((p) => p.mode === mode).map((p) => (
        <div key={p.mode2} className="zen-pb">
          <div className="zen-pb-k">{p.mode2} {mode === "time" ? "seconds" : "words"}</div>
          <div className="zen-pb-v">{p.wpm != null ? Math.round(p.wpm) : "-"}</div>
          <div className="zen-pb-a">{p.acc != null ? `${Math.round(p.acc)}%` : "-"}</div>
          {p.src ? <div className={`zen-pb-src ${p.src}`}>{p.src}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default function AccountView({ stats, onClose, onChangeUser }: { stats: PortalStats | null; onClose: () => void; onChangeUser: () => void }) {
  const [tab, setTab] = useState<"all" | "ours" | "mt">("all");
  const s = !stats ? null : tab === "all" ? stats.merged : tab === "ours" ? stats.ours : stats.mt;
  const joined = s?.joined ? new Date(s.joined * 1000) : null;
  const need = Math.max(1, s?.level_need || 1);
  return (
    <div className="zen-account">
      <div className="zen-acc-tabs">
        {(["all", "ours", "mt"] as const).map((k) => (
          <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{zt(k)}</button>
        ))}
        <span className="zen-spacer" />
        <button type="button" onClick={onChangeUser}>{zt("change_user")}</button>
        <button type="button" onClick={onClose}>✕ {zt("close")}</button>
      </div>
      {!s ? <div className="zen-sub">{zt("no_data")}</div> : (
        <>
          <div className="zen-acc-card zen-pilot">
            <div className="zen-avatar" aria-hidden><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg></div>
            <div className="zen-pilot-main">
              <div className="zen-pilot-name">{s.name || stats?.mt_username || "pilot"}</div>
              <div className="zen-sub">{joined ? `${zt("joined")} ${joined.getDate()} ${MONTHS[joined.getMonth()]} ${joined.getFullYear()}` : ""}</div>
              <div className="zen-sub">{zt("streak")} {s.streak} {zt("days")}</div>
              <div className="zen-level"><span>{s.level || 1}</span><b><i style={{ width: `${Math.min(100, ((s.level_have || 0) / need) * 100)}%` }} /></b><em>{fmtK(s.level_have || 0)}/{fmtK(need)}</em></div>
            </div>
            <div className="zen-pilot-stat"><div className="zen-sub">{zt("tests_started")}</div><div className="zen-big">{s.started}</div></div>
            <div className="zen-pilot-stat"><div className="zen-sub">{zt("tests_done")}</div><div className="zen-big">{s.tests}</div></div>
            <div className="zen-pilot-stat"><div className="zen-sub">{zt("time_typing")}</div><div className="zen-big">{fmtHms(s.seconds || 0)}</div></div>
          </div>
          <div className="zen-pb-row"><Pbs s={s} mode="time" /><Pbs s={s} mode="words" /></div>
          <Activity s={s} />
        </>
      )}
    </div>
  );
}
