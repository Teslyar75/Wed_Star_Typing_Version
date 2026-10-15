/** Обзор АНГЛИЙСКИЙ — паритет stamina/english/pages_main.OverviewPage. */
import { speakText } from "./speak";
import { useEffect, useMemo, useState } from "react";
import { t } from "../i18n";

export type EnProgress = {
  xp: number;
  rank: string;
  favorite: number;
  learned: number;
  inbox: number;
  due: number;
  streak_days?: number;
  best_streak?: number;
  day_flags?: boolean[];
  daily_goal?: number;
  xp_today?: number;
  new_available?: number;
  level?: number;
  level_lo?: number;
  level_hi?: number;
  vocab_total?: number;
};

type Wod = { id: number; word: string; translation: string; example: string; rank: number; pos: string };

type BookPlate = {
  title: string;
  meta: string;
  sample: string;
  hasBook: boolean;
};

type Props = {
  prog: EnProgress;
  book: BookPlate;
  onStartLesson: () => void;
  onQuickMission: () => void;
  onFromBook: () => void;
  onFormBook: () => void;
  onPracticeBook: () => void;
  onOpenBookSection: () => void;
  onOpenSet: (setId: string) => void;
  onScanWord: (word: string) => void;
};

const SETS = [
  { id: "top-1000", lim: 1000, name: "Essential 1000", sub: "Фундамент", code: "S-1000" },
  { id: "top-3000", lim: 3000, name: "Core 3000", sub: "Разговорный", code: "S-3000" },
  { id: "top-10000", lim: 10000, name: "Advanced 10 000", sub: "Свободный", code: "S-10K" },
  { id: "top-20000", lim: 20000, name: "Master 20 000", sub: "Как носитель", code: "S-20K" },
  { id: "dev-interview", lim: 0, name: "IT Interview", sub: "Собеседование", code: "S-DEV" },
];

function AccRingMini({ pct, sub }: { pct: number; sub: string }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, pct / 100));
  const col = pct >= 100 ? "var(--st-ok)" : pct >= 50 ? "var(--st-accent)" : "var(--st-cyan)";
  return (
    <div className="en-ring">
      <div className="en-ring-title">{t("daily_goal")}</div>
      <svg viewBox="0 0 120 120" className="en-ring-svg" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="color-mix(in srgb, var(--st-cyan) 25%, #061018)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="5"
          strokeDasharray={`${frac * circ} ${circ}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="56" textAnchor="middle" className="en-ring-pct">
          {pct.toFixed(1)}%
        </text>
        <text x="60" y="74" textAnchor="middle" className="en-ring-sub">
          {sub}
        </text>
      </svg>
    </div>
  );
}

export default function EnglishOverview({
  prog,
  book,
  onStartLesson,
  onQuickMission,
  onFromBook,
  onFormBook,
  onPracticeBook,
  onOpenBookSection,
  onOpenSet,
  onScanWord,
}: Props) {
  const [wod, setWod] = useState<Wod | null>(null);
  const goal = prog.daily_goal ?? 30;
  const xpToday = prog.xp_today ?? 0;
  const pct = goal > 0 ? Math.min(100, (100 * xpToday) / goal) : 0;
  const streak = prog.streak_days ?? 0;
  const best = prog.best_streak ?? streak;
  const flags = prog.day_flags ?? Array.from({ length: 14 }, () => false);
  const level = prog.level ?? 1;
  const lo = prog.level_lo ?? 0;
  const hi = prog.level_hi ?? 40;
  const levelFrac = (prog.xp - lo) / Math.max(1, hi - lo);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/english/word-of-day", { credentials: "include" });
      if (r.ok) setWod(await r.json());
    })();
  }, []);

  const sectors = useMemo(() => {
    const known = prog.learned ?? 0;
    let rem = known;
    return SETS.map((s) => {
      if (s.lim <= 0) return { ...s, known: 0 };
      const k = Math.min(s.lim, Math.max(0, rem));
      rem -= k;
      return { ...s, known: k };
    });
  }, [prog.learned]);

  const speak = (word: string) => {
    if (word) speakText(word, "en-US");
  };

  return (
    <div className="en-overview-grid">
      <div className="en-left-col">
        <aside className="inst-panel en-today tone-amber">
          <h3>{t("en_course_today")}</h3>
          <div className="en-today-body">
            <AccRingMini pct={pct} sub={`${xpToday} / ${goal} XP`} />
            <ul className="tele-list en-today-stats">
              <li className="tele-time">
                <span className="lab">{t("en_to_review")}</span>
                <strong>{prog.due}</strong>
              </li>
              <li className="tele-ok">
                <span className="lab">{t("en_new_avail")}</span>
                <strong>{prog.new_available ?? 20}</strong>
              </li>
              <li className="tele-streak">
                <span className="lab">{t("en_day_streak")}</span>
                <strong>
                  {streak} / {best}
                </strong>
              </li>
            </ul>
            <div className="en-today-acts">
              <button type="button" className="hud-btn amber" onClick={onStartLesson}>
                ▶ {t("en_start_lesson")}
              </button>
              <button type="button" className="hud-btn" onClick={onQuickMission}>
                {t("en_quick_mission")}
              </button>
              <button type="button" className="hud-btn" onClick={onFromBook}>
                {t("en_from_book_cards")}
              </button>
              <p className="muted en-today-hint">{t("en_course_hint")}</p>
            </div>
          </div>
        </aside>

        <section className="en-sectors-wrap">
          <h3 className="en-sec-title">{t("en_sectors")}</h3>
          <div className="en-sectors">
            {sectors.map((s) => {
              const lim = s.lim > 0 ? s.lim : 1;
              const frac = s.lim > 0 ? s.known / lim : 0;
              const status =
                s.lim <= 0 ? t("en_set_thematic") : frac >= 1 ? t("en_set_done") : s.known ? t("en_set_progress") : t("en_set_new");
              const tone = frac >= 1 ? "done" : s.known ? "ready" : "idle";
              return (
                <button key={s.id} type="button" className={`en-sector tone-${tone}`} onClick={() => onOpenSet(s.id)}>
                  <div className="ens-top">
                    <span className="ens-code">{s.code}</span>
                    <span className="ens-sub">{s.sub}</span>
                  </div>
                  <div className="ens-name">{s.name}</div>
                  <div className="ens-meta muted">
                    {s.lim > 0
                      ? `${t("en_know").replace("{0}", String(s.known)).replace("{1}", String(s.lim))} · ${status}`
                      : status}
                  </div>
                  <svg className="ens-spark" viewBox="0 0 100 28" aria-hidden>
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      points="4,20 20,12 36,18 52,8 68,14 84,6 96,16"
                    />
                  </svg>
                  <div className="ens-bars">
                    {Array.from({ length: 16 }, (_, i) => (
                      <span key={i} className={i < Math.round(frac * 16) || (s.known > 0 && i === 0) ? "on" : ""} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="inst-panel en-book-plate">
          <h3>{t("en_book_plate")}</h3>
          <div className="en-book-body">
            <div className="en-book-info">
              <strong className="en-book-title">{book.title}</strong>
              <p className="muted en-book-meta">{book.meta}</p>
              {book.sample ? <p className="en-book-sample">{book.sample}</p> : null}
            </div>
            <div className="en-book-acts">
              <button type="button" className="hud-btn" onClick={onFormBook} disabled={!book.hasBook}>
                {t("en_book_form")}
              </button>
              <button type="button" className="hud-btn amber" onClick={onPracticeBook} disabled={!book.hasBook}>
                ▶ {t("en_book_practice")}
              </button>
              <button type="button" className="hud-btn" onClick={onOpenBookSection}>
                {t("en_book_open")}
              </button>
            </div>
          </div>
        </aside>

        <p className="muted en-sec-note">{t("en_sectors_note")}</p>
      </div>

      <div className="en-right-col">
        <aside className="inst-panel en-telemetry">
          <h3>{t("en_pilot_telemetry")}</h3>
          <div className="en-lvl-row">
            <strong className="en-lvl">{level}</strong>
            <div className="en-lvl-meta">
              <span className="lab">
                {t("en_level_meta")
                  .replace("{0}", String(prog.xp))
                  .replace("{1}", String(level + 1))
                  .replace("{2}", String(Math.max(0, hi - prog.xp)))}
              </span>
              <div className="en-lvl-bar">
                <div style={{ width: `${Math.max(0, Math.min(100, levelFrac * 100))}%` }} />
              </div>
              <span className="en-rank">★ {prog.rank}</span>
            </div>
          </div>
          <div className="en-streak-block">
            <div className="lab">
              {t("en_streak_14")} · {streak} {t("en_days")}
            </div>
            <div className="en-streak-segs">
              {flags.map((on, i) => (
                <span key={i} className={`en-seg ${on ? "on" : ""}`} />
              ))}
            </div>
          </div>
          <div className="en-learned-block">
            <div className="lab">{t("en_learned_set")}</div>
            <div className="en-lvl-bar green">
              <div
                style={{
                  width: `${Math.min(100, ((prog.learned || 0) / Math.max(1, prog.vocab_total || 1000)) * 100)}%`,
                }}
              />
            </div>
            <span className="muted">
              {prog.learned} / {prog.vocab_total || "—"}
            </span>
          </div>
        </aside>

        <aside className="inst-panel en-wod">
          <h3>{t("en_word_of_day")}</h3>
          {wod ? (
            <>
              <div className="en-wod-meta muted">
                #{wod.rank} · {wod.pos}
              </div>
              <div className="en-wod-word-row">
                <strong className="en-wod-word">{wod.word}</strong>
                <button type="button" className="hud-btn" onClick={() => speak(wod.word)}>
                  {t("voice")}
                </button>
              </div>
              <p className="en-wod-def">{wod.translation || wod.example || "—"}</p>
              <button type="button" className="hud-btn" onClick={() => onScanWord(wod.word)}>
                {t("en_scan")}
              </button>
            </>
          ) : (
            <p className="muted">…</p>
          )}
        </aside>
      </div>
    </div>
  );
}
