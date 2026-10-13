/** Змейка — паритет stamina/lounge/snake.py (GRID=20, GameShell). */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import GameShell from "./GameShell";
import { useFieldSize } from "./useFieldSize";

const GRID = 20;

type Pt = { x: number; y: number };

function randFood(snake: Pt[]): Pt {
  for (;;) {
    const p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, msg: string) {
  ctx.fillStyle = "rgba(8, 12, 18, 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f0a030";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = msg.split("\n");
  const lh = 32;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, y0 + i * lh));
}

type Props = {
  record?: number;
  onLobby: () => void;
  onScore?: (score: number) => void;
};

export default function SnakeGame({ record = 0, onLobby, onScore }: Props) {
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const field = useFieldSize(wrapRef);
  const snake = useRef<Pt[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]);
  const dir = useRef<Pt>({ x: 1, y: 0 });
  const nextDir = useRef<Pt>({ x: 1, y: 0 });
  const food = useRef<Pt>(randFood(snake.current));
  const scoreRef = useRef(0);
  const grow = useRef(0);
  const pausedRef = useRef(false);
  const overRef = useRef(false);

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = field.w;
    const h = field.h;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    ctx.fillStyle = "#1a2430";
    ctx.fillRect(0, 0, w, h);
    const pad = 20;
    const cell = Math.max(10, Math.min(Math.floor((w - pad * 2) / GRID), Math.floor((h - pad * 2) / GRID)));
    const gw = cell * GRID;
    const gh = cell * GRID;
    const ox = Math.floor((w - gw) / 2);
    const oy = Math.floor((h - gh) / 2);

    ctx.strokeStyle = "rgba(120,160,180,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 2, oy - 2, gw + 4, gh + 4);
    ctx.fillStyle = "#0e1620";
    ctx.fillRect(ox, oy, gw, gh);
    ctx.strokeStyle = "rgba(80,110,130,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + i * cell, oy);
      ctx.lineTo(ox + i * cell, oy + gh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + i * cell);
      ctx.lineTo(ox + gw, oy + i * cell);
      ctx.stroke();
    }

    const fx = food.current.x;
    const fy = food.current.y;
    ctx.beginPath();
    ctx.ellipse(
      ox + fx * cell + cell / 2,
      oy + fy * cell + cell / 2,
      cell / 2 - 3,
      cell / 2 - 3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#f0a030";
    ctx.fill();

    snake.current.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#3ec6e0" : i % 2 === 0 ? "#3dba7a" : "#2a9a6a";
      ctx.fillRect(ox + p.x * cell + 1, oy + p.y * cell + 1, cell - 2, cell - 2);
    });

    ctx.fillStyle = "#e8f0ff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(t("lounge_len").replace("{0}", String(snake.current.length)), ox + gw / 2, oy - 8);

    if (overRef.current) drawOverlay(ctx, w, h, t("lounge_snake_over"));
    else if (pausedRef.current) drawOverlay(ctx, w, h, t("lounge_pause"));
  };

  const reset = () => {
    snake.current = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    dir.current = { x: 1, y: 0 };
    nextDir.current = { x: 1, y: 0 };
    food.current = randFood(snake.current);
    scoreRef.current = 0;
    grow.current = 0;
    setScore(0);
    setOver(false);
    overRef.current = false;
    setPaused(false);
    pausedRef.current = false;
  };

  const togglePause = () => {
    if (overRef.current) {
      reset();
      setRunning(true);
      draw();
      return;
    }
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        if (overRef.current) {
          reset();
          setRunning(true);
          draw();
          return;
        }
        togglePause();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reset();
        setRunning(true);
        draw();
        return;
      }
      if (pausedRef.current || overRef.current) return;
      const map: Record<string, Pt> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        W: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        S: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        A: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
        D: { x: 1, y: 0 },
      };
      const nd = map[e.key];
      if (!nd) return;
      e.preventDefault();
      if (nd.x + dir.current.x !== 0 || nd.y + dir.current.y !== 0) nextDir.current = nd;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running || paused || over) return;
    const ms = Math.max(70, 160 - scoreRef.current / 5);
    const id = window.setInterval(() => {
      dir.current = nextDir.current;
      const head = snake.current[0]!;
      const nh = { x: head.x + dir.current.x, y: head.y + dir.current.y };
      if (
        nh.x < 0 ||
        nh.y < 0 ||
        nh.x >= GRID ||
        nh.y >= GRID ||
        snake.current.some((p) => p.x === nh.x && p.y === nh.y)
      ) {
        overRef.current = true;
        setOver(true);
        setRunning(false);
        pausedRef.current = true;
        setPaused(true);
        onScore?.(scoreRef.current);
        draw();
        return;
      }
      snake.current = [nh, ...snake.current];
      if (nh.x === food.current.x && nh.y === food.current.y) {
        food.current = randFood(snake.current);
        scoreRef.current += 10;
        setScore(scoreRef.current);
        grow.current += 1;
      }
      if (grow.current > 0) grow.current -= 1;
      else snake.current.pop();
      draw();
    }, ms);
    return () => clearInterval(id);
  }, [running, paused, over, onScore, field.w, field.h]);

  useEffect(() => {
    draw();
  }, [field.w, field.h, score, paused, over]);

  return (
    <GameShell
      title={t("lounge_snake_title")}
      hint={t("snake_hint")}
      score={score}
      record={Math.max(record, score)}
      paused={paused}
      over={over}
      onTogglePause={togglePause}
      onRestart={() => {
        reset();
        setRunning(true);
        draw();
      }}
      onLobby={onLobby}
    >
      <div ref={wrapRef} className="game-shell-field-fill">
        <canvas ref={canvasRef} className="lounge-canvas game-canvas" tabIndex={0} aria-label="snake" />
      </div>
    </GameShell>
  );
}
