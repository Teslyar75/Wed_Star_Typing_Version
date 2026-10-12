import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

const CELL = 16;
const COLS = 24;
const ROWS = 16;

type Pt = { x: number; y: number };

function randFood(snake: Pt[]): Pt {
  for (;;) {
    const p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

type Props = { onScore?: (score: number) => void };

export default function SnakeGame({ onScore }: Props) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snake = useRef<Pt[]>([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]);
  const dir = useRef<Pt>({ x: 1, y: 0 });
  const nextDir = useRef<Pt>({ x: 1, y: 0 });
  const food = useRef<Pt>(randFood(snake.current));
  const scoreRef = useRef(0);

  const reset = () => {
    snake.current = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    dir.current = { x: 1, y: 0 };
    nextDir.current = { x: 1, y: 0 };
    food.current = randFood(snake.current);
    scoreRef.current = 0;
    setScore(0);
    setDead(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // как на десктопе: Esc / P — пауза; R — заново; после гибели Esc — рестарт
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        if (dead) {
          reset();
          setRunning(true); // как десктоп: Esc после гибели = сразу новый заход
          return;
        }
        setRunning((r) => !r);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reset();
        setRunning(true);
        return;
      }
      if (e.key === "ArrowUp" && dir.current.y === 0) {
        e.preventDefault();
        nextDir.current = { x: 0, y: -1 };
      }
      if (e.key === "ArrowDown" && dir.current.y === 0) {
        e.preventDefault();
        nextDir.current = { x: 0, y: 1 };
      }
      if (e.key === "ArrowLeft" && dir.current.x === 0) {
        e.preventDefault();
        nextDir.current = { x: -1, y: 0 };
      }
      if (e.key === "ArrowRight" && dir.current.x === 0) {
        e.preventDefault();
        nextDir.current = { x: 1, y: 0 };
      }
      if (e.key === "w" || e.key === "W") {
        if (dir.current.y === 0) nextDir.current = { x: 0, y: -1 };
      }
      if (e.key === "s" || e.key === "S") {
        if (dir.current.y === 0) nextDir.current = { x: 0, y: 1 };
      }
      if (e.key === "a" || e.key === "A") {
        if (dir.current.x === 0) nextDir.current = { x: -1, y: 0 };
      }
      if (e.key === "d" || e.key === "D") {
        if (dir.current.x === 0) nextDir.current = { x: 1, y: 0 };
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (dead) {
          reset();
          setRunning(true);
        } else setRunning((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dead]);

  useEffect(() => {
    if (!running || dead) return;
    const id = window.setInterval(() => {
      dir.current = nextDir.current;
      const head = snake.current[0]!;
      const nh = { x: head.x + dir.current.x, y: head.y + dir.current.y };
      if (nh.x < 0 || nh.y < 0 || nh.x >= COLS || nh.y >= ROWS || snake.current.some((p) => p.x === nh.x && p.y === nh.y)) {
        setDead(true);
        setRunning(false);
        onScore?.(scoreRef.current);
        return;
      }
      const grow = nh.x === food.current.x && nh.y === food.current.y;
      snake.current = [nh, ...snake.current.slice(0, grow ? undefined : -1)];
      if (grow) {
        food.current = randFood(snake.current);
        scoreRef.current += 10;
        setScore(scoreRef.current);
      }
      const c = canvasRef.current?.getContext("2d");
      if (!c) return;
      c.fillStyle = "#0a1220";
      c.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      c.fillStyle = "#3d9a5f";
      for (const p of snake.current) c.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
      c.fillStyle = "#c9a227";
      c.fillRect(food.current.x * CELL + 2, food.current.y * CELL + 2, CELL - 4, CELL - 4);
    }, 120);
    return () => clearInterval(id);
  }, [running, dead, onScore]);

  useEffect(() => {
    const c = canvasRef.current?.getContext("2d");
    if (!c) return;
    c.fillStyle = "#0a1220";
    c.fillRect(0, 0, COLS * CELL, ROWS * CELL);
  }, []);

  return (
    <div className="snake">
      <div className="bridge-actions">
        <button
          type="button"
          className="hud-btn amber"
          onClick={() => {
            if (dead) reset();
            setRunning((r) => !r);
          }}
        >
          {running ? t("pause") : t("start")}
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            reset();
            setRunning(false);
          }}
        >
          {t("again")}
        </button>
        <span className="muted">
          {t("score")}: {score}
          {dead ? ` · ${t("game_over")}` : ""}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="snake-canvas"
        tabIndex={0}
        aria-label="snake"
      />
      <p className="hint muted">{t("snake_hint")}</p>
    </div>
  );
}
