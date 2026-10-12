import { useEffect, useState } from "react";
import { t } from "../i18n";
import SnakeGame from "./SnakeGame";
import TetrisGame from "./TetrisGame";
import BreakoutGame from "./BreakoutGame";

type Game = "snake" | "tetris" | "breakout";
type BoardRow = { id: number; game: string; score: number; callsign: string };

export default function LoungePanel() {
  const [game, setGame] = useState<Game>("snake");
  const [best, setBest] = useState(() => Number(localStorage.getItem("st_snake_best") || "0"));
  const [msg, setMsg] = useState("");
  const [board, setBoard] = useState<BoardRow[]>([]);

  const loadBoard = async (g: Game) => {
    try {
      const rows = await (await fetch(`/api/lounge/scores?game=${g}&limit=10`)).json();
      setBoard(rows);
    } catch {
      setBoard([]);
    }
  };

  useEffect(() => {
    void loadBoard(game);
  }, [game]);

  const onScore = async (score: number) => {
    if (game === "snake" && score > best) {
      setBest(score);
      localStorage.setItem("st_snake_best", String(score));
    }
    try {
      await fetch("/api/lounge/scores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, score }),
      });
      setMsg(`${t("lounge_xp")} · ${score}`);
      void loadBoard(game);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="lounge">
      <h2>{t("lounge")}</h2>
      <p className="muted">{t("lounge_blurb")}</p>
      <div className="bridge-actions">
        {(["snake", "tetris", "breakout"] as Game[]).map((g) => (
          <button key={g} type="button" className={`hud-btn ${game === g ? "amber" : ""}`} onClick={() => setGame(g)}>
            {t(g)}
          </button>
        ))}
      </div>
      {game === "snake" && (
        <p className="muted">
          {t("best")}: {best}
        </p>
      )}
      {msg && <p className="muted">{msg}</p>}
      {game === "snake" && <SnakeGame onScore={onScore} />}
      {game === "tetris" && <TetrisGame onScore={onScore} />}
      {game === "breakout" && <BreakoutGame onScore={onScore} />}
      <h3>{t("honor")}</h3>
      <ul className="mission-list">
        {board.map((r) => (
          <li key={r.id}>
            {r.callsign} · {r.score}
          </li>
        ))}
        {!board.length && <li className="muted">—</li>}
      </ul>
    </section>
  );
}
