/** Отчёт о полёте — порт stamina/bridge.py show_debrief + screenshots/mission_debrief.png */
import { useEffect } from "react";
import { t } from "../i18n";

export type DebriefSeg = {
  cpm: number;
  acc: number;
  errors: number;
  elapsed: number;
  rhythm: number;
  best_streak: number;
};

export type DebriefWeak = { ch: string; n: number };

export type DebriefData = {
  kind: "mission" | "cargo";
  title?: string;
  goal?: number;
  stars: number;
  xp: number;
  passed: boolean;
  newRank?: string | null;
  seg: DebriefSeg;
  weak: DebriefWeak[];
  nextId?: string | null;
  nextTitle?: string | null;
};

type Props = {
  data: DebriefData;
  onRepeat: () => void;
  onNext?: () => void;
  onRepair?: () => void;
  onClose: () => void;
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function Stars({ n }: { n: number }) {
  const k = Math.max(0, Math.min(3, n));
  return <div className="debrief-stars">{"★".repeat(k)}{"☆".repeat(3 - k)}</div>;
}

export default function DebriefModal({ data, onRepeat, onNext, onRepair, onClose }: Props) {
  const accent = data.passed ? "ok" : "bad";
  const headline =
    data.kind === "mission"
      ? data.passed
        ? t("debrief_mission_ok")
        : t("debrief_mission_fail")
      : t("debrief_cargo_ok");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onRepeat();
        return;
      }
      if (e.key === "ArrowRight" && data.nextId && onNext) {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key.toLowerCase() === "r" && onRepair) {
        e.preventDefault();
        onRepair();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data.nextId, onClose, onNext, onRepair, onRepeat]);

  const cells: { cap: string; val: string; unit?: string; tone: string }[] = [
    { cap: t("debrief_speed"), val: `${Math.round(data.seg.cpm)}`, unit: t("cpm_unit"), tone: "cyan" },
    {
      cap: t("debrief_acc"),
      val: `${data.seg.acc.toFixed(1)}%`,
      tone: data.seg.acc >= 96 ? "ok" : "amber",
    },
    {
      cap: t("debrief_errors"),
      val: String(data.seg.errors),
      tone: data.seg.errors ? "bad" : "ok",
    },
    { cap: t("debrief_time"), val: fmtTime(data.seg.elapsed), tone: "text" },
    { cap: t("debrief_rhythm"), val: `${Math.round(data.seg.rhythm)}%`, tone: "cyan" },
    {
      cap: t("debrief_streak"),
      val: String(data.seg.best_streak),
      unit: t("debrief_streak_unit"),
      tone: "amber",
    },
  ];

  return (
    <div className="debrief-overlay" role="dialog" aria-modal="true" aria-label={t("debrief_title")}>
      <div className={`debrief-modal inst-panel tone-${accent}`}>
        <header className="debrief-h">
          <span className="muted">{t("debrief_title")}</span>
          <h2 className={`debrief-headline ${accent}`}>{headline}</h2>
          {data.kind === "mission" ? <Stars n={data.stars} /> : null}
          {data.kind === "mission" && !data.passed ? (
            <p className="muted debrief-hint">{t("debrief_need_acc")}</p>
          ) : null}
          {data.kind === "mission" && data.passed && data.goal ? (
            <p className="muted debrief-hint">{t("debrief_goal_hint").replace("{0}", String(data.goal))}</p>
          ) : null}
        </header>

        <div className="debrief-grid">
          {cells.map((c) => (
            <div key={c.cap} className="debrief-cell">
              <span className="debrief-cap">{c.cap}</span>
              <strong className={`debrief-val tone-${c.tone}`}>{c.val}</strong>
              {c.unit ? <span className="muted debrief-unit">{c.unit}</span> : null}
            </div>
          ))}
        </div>

        <p className="debrief-xp">
          +{data.xp} XP
          {data.newRank ? `   ·   ${t("debrief_new_rank").replace("{0}", data.newRank.toUpperCase())}` : ""}
        </p>

        {data.weak.length ? (
          <p className="debrief-weak">
            {t("debrief_weak").replace(
              "{0}",
              data.weak.map((w) => `«${w.ch}» ×${w.n}`).join(", "),
            )}
          </p>
        ) : null}

        <footer className="debrief-actions">
          <button type="button" className="hud-btn" onClick={onRepeat}>
            ↻ {t("debrief_repeat")} Enter
          </button>
          {data.nextId && onNext ? (
            <button type="button" className="hud-btn ok" onClick={onNext}>
              ▶ {t("debrief_next").replace("{0}", (data.nextTitle || data.nextId).toUpperCase())} →
            </button>
          ) : null}
          {onRepair ? (
            <button type="button" className="hud-btn amber" onClick={onRepair}>
              ⚙ {t("debrief_repair")} R
            </button>
          ) : null}
          <button type="button" className="hud-btn" onClick={onClose}>
            ✕ {t("debrief_close")} Esc
          </button>
        </footer>
      </div>
    </div>
  );
}
