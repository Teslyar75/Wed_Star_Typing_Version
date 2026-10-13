/** Комната отдыха — лобби как stamina/lounge/screen.LoungeScreen. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import SnakeGame from "./SnakeGame";
import TetrisGame from "./TetrisGame";
import BreakoutGame from "./BreakoutGame";

type GameId = "tetris" | "snake" | "breakout";

type GameMeta = {
  id: GameId;
  titleKey: string;
  subKey: string;
  blurbKey: string;
  tone: "cyan" | "ok" | "purple";
};

const GAMES: GameMeta[] = [
  {
    id: "tetris",
    titleKey: "tetris",
    subKey: "lounge_tetris_sub",
    blurbKey: "lounge_tetris_blurb",
    tone: "cyan",
  },
  {
    id: "snake",
    titleKey: "snake",
    subKey: "lounge_snake_sub",
    blurbKey: "lounge_snake_blurb",
    tone: "ok",
  },
  {
    id: "breakout",
    titleKey: "breakout",
    subKey: "lounge_ark_sub",
    blurbKey: "lounge_ark_blurb",
    tone: "purple",
  },
];

/** Мини-превью как canvas на десктопе — без обводки, только тонированный фон. */
function Preview({ id, tone }: { id: GameId; tone: GameMeta["tone"] }) {
  return (
    <div className={`lounge-prev tone-${tone}`} aria-hidden>
      <svg viewBox="0 0 200 90" preserveAspectRatio="xMidYMid meet">
        {id === "tetris" && (
          <>
            <rect x="78" y="10" width="18" height="18" />
            <rect x="78" y="28" width="18" height="18" />
            <rect x="78" y="46" width="18" height="18" />
            <rect x="96" y="46" width="18" height="18" />
            <rect x="60" y="64" width="18" height="18" />
            <rect x="78" y="64" width="18" height="18" />
            <rect x="96" y="64" width="18" height="18" />
          </>
        )}
        {id === "snake" && (
          <>
            <rect x="40" y="48" width="14" height="14" />
            <rect x="54" y="48" width="14" height="14" />
            <rect x="68" y="48" width="14" height="14" />
            <rect x="82" y="48" width="14" height="14" />
            <rect x="82" y="34" width="14" height="14" />
            <rect x="82" y="20" width="14" height="14" className="head" />
            <rect x="120" y="20" width="12" height="12" className="food" />
          </>
        )}
        {id === "breakout" && (
          <>
            {Array.from({ length: 3 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={12 + c * 22}
                  y={10 + r * 12}
                  width="20"
                  height="10"
                  opacity={1 - r * 0.2}
                />
              )),
            )}
            <rect x="78" y="72" width="44" height="8" className="paddle" />
            <circle cx="100" cy="58" r="5" className="ball" />
          </>
        )}
      </svg>
    </div>
  );
}

export default function LoungePanel() {
  const [active, setActive] = useState<GameId | null>(null);
  const [records, setRecords] = useState<Record<GameId, number>>({ tetris: 0, snake: 0, breakout: 0 });
  const [msg, setMsg] = useState("");

  const refreshRecords = useCallback(async () => {
    const next = { tetris: 0, snake: 0, breakout: 0 };
    await Promise.all(
      (["tetris", "snake", "breakout"] as GameId[]).map(async (g) => {
        try {
          const rows = (await (await fetch(`/api/lounge/scores?game=${g}&limit=1`)).json()) as {
            score: number;
          }[];
          next[g] = rows[0]?.score ?? Number(localStorage.getItem(`st_${g}_best`) || "0");
        } catch {
          next[g] = Number(localStorage.getItem(`st_${g}_best`) || "0");
        }
      }),
    );
    setRecords(next);
  }, []);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords, active]);

  const onScore = async (score: number) => {
    if (!active) return;
    const key = `st_${active}_best`;
    const prev = Number(localStorage.getItem(key) || "0");
    if (score > prev) localStorage.setItem(key, String(score));
    try {
      await fetch("/api/lounge/scores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: active, score }),
      });
      setMsg(`${t("lounge_xp")} · ${score}`);
      void refreshRecords();
    } catch {
      /* ignore */
    }
  };

  const backToLobby = () => {
    setActive(null);
    setMsg("");
  };

  if (active) {
    return (
      <section className="lounge lounge-play" data-nav-lock aria-label={msg || undefined}>
        {active === "snake" && (
          <SnakeGame record={records.snake} onLobby={backToLobby} onScore={onScore} />
        )}
        {active === "tetris" && (
          <TetrisGame record={records.tetris} onLobby={backToLobby} onScore={onScore} />
        )}
        {active === "breakout" && (
          <BreakoutGame record={records.breakout} onLobby={backToLobby} onScore={onScore} />
        )}
      </section>
    );
  }

  return (
    <section className="lounge lounge-lobby">
      <header className="lounge-head">
        <h2 className="route-title lounge-title">{t("lounge_room")}</h2>
        <p className="muted lounge-sub">{t("lounge_blurb_full")}</p>
      </header>

      <div className="lounge-grid" data-nav-group="lounge-games">
        {GAMES.map((g) => (
          <article key={g.id} className={`inst-panel lounge-card tone-${g.tone}`}>
            <div className="lab">{t(g.subKey)}</div>
            <h3 className={`lounge-game-title tone-${g.tone}`}>{t(g.titleKey)}</h3>
            <p className="lounge-blurb">{t(g.blurbKey)}</p>
            <div className="lounge-rec muted">
              {t("lounge_record")} {records[g.id]}
            </div>
            <Preview id={g.id} tone={g.tone} />
            <button type="button" className={`hud-btn lounge-play-btn tone-${g.tone}`} onClick={() => setActive(g.id)}>
              ▶ {t("lounge_play")}
            </button>
          </article>
        ))}
      </div>

      <p className="muted lounge-foot">{t("lounge_controls")}</p>
    </section>
  );
}
