/** Обзор СКОРОЧТЕНИЕ — паритет stamina/speedread/screen.OverviewPage. */
import { useMemo } from "react";
import { t } from "../i18n";

export type SrSession = { id: number; mode: string; wpm: number; words: number; elapsed: number; score: number };

export type SrBook = {
  title: string;
  author?: string;
  status: string;
  lang: string;
  readWord: number;
  totalWords: number;
  typeWord: number | null;
  startWpm: number;
  hasBook: boolean;
};

export type SrTrainer = {
  code: string;
  title: string;
  desc: string;
  ready: boolean;
  best: string;
};

type Props = {
  book: SrBook;
  sessions: SrSession[];
  targetWpm: number;
  recordWpm: number | null;
  effWpm: number | null;
  streak: number;
  xp: number;
  trainers: SrTrainer[];
  onHyperdrive: () => void;
  onBook: () => void;
  onLibrary: () => void;
  onTrainer: (code: string) => void;
};

function CompRing({ avg }: { avg: number | null }) {
  const pct = avg == null ? 0 : Math.max(0, Math.min(100, avg));
  const r = 42;
  const circ = 2 * Math.PI * r;
  const frac = avg == null ? 0 : pct / 100;
  return (
    <div className="sr-comp-ring">
      <div className="lab">{t("sr_tests")}</div>
      <svg viewBox="0 0 110 110" className="sr-comp-svg" aria-hidden>
        <circle cx="55" cy="55" r={r} fill="none" stroke="color-mix(in srgb, var(--st-cyan) 22%, #061018)" strokeWidth="8" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={avg == null ? "transparent" : "var(--st-ok)"}
          strokeWidth="5"
          strokeDasharray={`${frac * circ} ${circ}`}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="52" textAnchor="middle" className="sr-comp-pct">
          {avg == null ? "—" : `${pct.toFixed(1)}%`}
        </text>
        <text x="55" y="68" textAnchor="middle" className="sr-comp-sub">
          {avg == null ? t("sr_no_tests") : t("sr_avg_20")}
        </text>
      </svg>
    </div>
  );
}

function WpmChart({ sessions, target }: { sessions: SrSession[]; target: number }) {
  const pts = useMemo(() => {
    const rows = sessions.filter((s) => s.wpm > 0).slice(0, 30).reverse();
    return rows.map((s) => ({ wpm: s.wpm, eff: s.score > 0 && s.score < s.wpm ? s.score : s.wpm * 0.85 }));
  }, [sessions]);
  const w = 520;
  const h = 168;
  const pad = 12;
  const maxY = Math.max(target, 100, ...pts.map((p) => p.wpm), 1);
  const xAt = (i: number) => pad + (pts.length <= 1 ? (w - pad * 2) / 2 : (i / (pts.length - 1)) * (w - pad * 2));
  const yAt = (v: number) => h - pad - (v / maxY) * (h - pad * 2);
  const yTarget = yAt(target);
  const line = (key: "wpm" | "eff") =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p[key])}`).join(" ");

  return (
    <svg className="sr-wpm-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t("sr_speed_chart")}>
      <line x1={pad} x2={w - pad} y1={yTarget} y2={yTarget} className="sr-target-line" />
      <text x={w - pad} y={yTarget - 4} textAnchor="end" className="sr-target-lab">
        {t("sr_goal")} {target}
      </text>
      {pts.length > 1 ? (
        <>
          <path d={line("wpm")} className="sr-line-wpm" fill="none" />
          <path d={line("eff")} className="sr-line-eff" fill="none" />
        </>
      ) : pts.length === 1 ? (
        <circle cx={xAt(0)} cy={yAt(pts[0]!.wpm)} r="4" className="sr-dot" />
      ) : (
        <text x={w / 2} y={h / 2} textAnchor="middle" className="sr-chart-empty">
          {t("sr_no_sessions")}
        </text>
      )}
    </svg>
  );
}

export default function SpeedOverview({
  book,
  sessions,
  targetWpm,
  recordWpm,
  effWpm,
  streak,
  xp,
  trainers,
  onHyperdrive,
  onBook,
  onLibrary,
  onTrainer,
}: Props) {
  const readPct = book.totalWords > 0 ? Math.round((100 * book.readWord) / book.totalWords) : 0;
  const typePct =
    book.typeWord != null && book.totalWords > 0 ? Math.round((100 * book.typeWord) / book.totalWords) : null;
  const compAvg = useMemo(() => {
    const quiz = sessions.filter((s) => s.mode === "quiz" && s.score > 0);
    if (!quiz.length) return null;
    const last = quiz.slice(0, 20);
    return (100 * last.reduce((a, s) => a + Math.min(1, s.score / Math.max(1, s.words || 1)), 0)) / last.length;
  }, [sessions]);

  return (
    <div className="sr-overview">
      <div className="sr-top">
        <aside className="inst-panel sr-launch tone-amber">
          <h3>{t("sr_launch")}</h3>
          {book.hasBook ? (
            <>
              <strong className="sr-book-title">{book.title}</strong>
              {book.author ? <div className="muted sr-book-author">{book.author}</div> : null}
              <div className="sr-book-status">
                ● {book.status} · {book.lang.toUpperCase()}
              </div>
              <div className="sr-book-pos">
                {t("sr_reading")
                  .replace("{0}", book.readWord.toLocaleString("ru-RU"))
                  .replace("{1}", book.totalWords.toLocaleString("ru-RU"))
                  .replace("{2}", `${readPct}%`)}
                <br />
                {t("sr_typing").replace(
                  "{0}",
                  book.typeWord != null ? `${book.typeWord.toLocaleString("ru-RU")} · ${typePct}%` : "—",
                )}
                <br />
                {t("sr_start_wpm").replace("{0}", String(book.startWpm))}
              </div>
            </>
          ) : (
            <>
              <strong className="sr-book-title">{t("sr_lib_empty")}</strong>
              <p className="muted">{t("sr_lib_empty_hint")}</p>
            </>
          )}
          <div className="sr-launch-acts">
            <button type="button" className="hud-btn amber" disabled={!book.hasBook} onClick={onHyperdrive}>
              ▶ {t("hyperdrive")}
            </button>
            <button type="button" className="hud-btn ok" disabled={!book.hasBook} onClick={onBook}>
              📖 {t("sr_book")}
            </button>
            <button type="button" className="hud-btn" onClick={onLibrary}>
              {t("library")}
            </button>
          </div>
        </aside>

        <section className="inst-panel sr-chart-panel">
          <h3>{t("sr_speed_chart")}</h3>
          <WpmChart sessions={sessions} target={targetWpm} />
        </section>

        <aside className="inst-panel sr-comp">
          <h3>{t("sr_comprehension")}</h3>
          <CompRing avg={compAvg} />
        </aside>

        <aside className="inst-panel sr-tele">
          <h3>{t("sr_telemetry")}</h3>
          <ul className="tele-list sr-tele-list">
            <li className="tele-time">
              <i className="sr-tele-bar" aria-hidden />
              <span className="lab">{t("sr_record")}</span>
              <strong>{recordWpm ?? "—"}</strong>
            </li>
            <li className="tele-ok">
              <i className="sr-tele-bar" aria-hidden />
              <span className="lab">{t("sr_eff")}</span>
              <strong>{effWpm ?? "—"}</strong>
            </li>
            <li className="tele-streak">
              <i className="sr-tele-bar" aria-hidden />
              <span className="lab">{t("sr_streak")}</span>
              <strong>{streak}</strong>
            </li>
            <li className="tele-streak">
              <i className="sr-tele-bar" aria-hidden />
              <span className="lab">{t("sr_xp")}</span>
              <strong>{xp}</strong>
            </li>
          </ul>
        </aside>
      </div>

      <h3 className="sr-trainers-title">{t("sr_trainers")}</h3>
      <div className="sr-trainers" data-nav-group="sr-trainers">
        {trainers.map((tr) => (
          <button
            key={tr.code}
            type="button"
            className={`sr-trainer ${tr.ready ? "ready" : "soon"}`}
            disabled={!tr.ready}
            onClick={() => tr.ready && onTrainer(tr.code)}
          >
            <span className="sr-tr-code">{tr.code}</span>
            <strong className="sr-tr-title">{tr.title}</strong>
            <span className="muted sr-tr-desc">{tr.desc}</span>
            <span className={`sr-tr-best ${tr.ready ? "ok" : ""}`}>
              {tr.ready ? `${t("sr_best")}: ${tr.best}` : t("sr_wip")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
