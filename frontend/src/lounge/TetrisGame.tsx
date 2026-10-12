import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

const COLS = 10;
const ROWS = 18;
const CELL = 16;
const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
];

type Props = { onScore?: (score: number) => void };

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function rotate(m: number[][]) {
  const h = m.length;
  const w = m[0]!.length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x]![h - 1 - y] = m[y]![x]!;
  return out;
}

export default function TetrisGame({ onScore }: Props) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const board = useRef(emptyBoard());
  const piece = useRef({ shape: SHAPES[0]!, x: 3, y: 0 });
  const scoreRef = useRef(0);

  const spawn = () => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]!;
    piece.current = { shape, x: Math.floor((COLS - shape[0]!.length) / 2), y: 0 };
    if (collides(piece.current.x, piece.current.y, piece.current.shape)) {
      setOver(true);
      setRunning(false);
      onScore?.(scoreRef.current);
    }
  };

  const collides = (x: number, y: number, shape: number[][]) => {
    for (let sy = 0; sy < shape.length; sy++) {
      for (let sx = 0; sx < shape[sy]!.length; sx++) {
        if (!shape[sy]![sx]) continue;
        const nx = x + sx;
        const ny = y + sy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board.current[ny]![nx]) return true;
      }
    }
    return false;
  };

  const merge = () => {
    const { shape, x, y } = piece.current;
    for (let sy = 0; sy < shape.length; sy++) {
      for (let sx = 0; sx < shape[sy]!.length; sx++) {
        if (!shape[sy]![sx]) continue;
        const ny = y + sy;
        const nx = x + sx;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) board.current[ny]![nx] = 1;
      }
    }
    let cleared = 0;
    board.current = board.current.filter((row) => {
      if (row.every((c) => c)) {
        cleared++;
        return false;
      }
      return true;
    });
    while (board.current.length < ROWS) board.current.unshift(Array(COLS).fill(0));
    if (cleared) {
      scoreRef.current += cleared * 100;
      setScore(scoreRef.current);
    }
    spawn();
  };

  const reset = () => {
    board.current = emptyBoard();
    scoreRef.current = 0;
    setScore(0);
    setOver(false);
    spawn();
  };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a1218";
    ctx.fillRect(0, 0, c.width, c.height);
    const paint = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    };
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (board.current[y]![x]) paint(x, y, "#3a8");
    const { shape, x, y } = piece.current;
    for (let sy = 0; sy < shape.length; sy++)
      for (let sx = 0; sx < shape[sy]!.length; sx++)
        if (shape[sy]![sx]) paint(x + sx, y + sy, "#f0a030");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        if (over) {
          reset();
          setRunning(true);
          return;
        }
        setRunning((r) => !r);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        reset();
        setRunning(true);
        return;
      }
      if (!running || over) return;
      const p = piece.current;
      if (e.key === "ArrowLeft" && !collides(p.x - 1, p.y, p.shape)) p.x -= 1;
      if (e.key === "ArrowRight" && !collides(p.x + 1, p.y, p.shape)) p.x += 1;
      if (e.key === "ArrowDown" && !collides(p.x, p.y + 1, p.shape)) p.y += 1;
      if (e.key === "ArrowUp") {
        const rot = rotate(p.shape);
        if (!collides(p.x, p.y, rot)) p.shape = rot;
      }
      if (e.key === " ") {
        e.preventDefault();
        while (!collides(p.x, p.y + 1, p.shape)) p.y += 1;
        merge();
      }
      draw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!running || over) return;
    const id = window.setInterval(() => {
      const p = piece.current;
      if (!collides(p.x, p.y + 1, p.shape)) p.y += 1;
      else merge();
      draw();
    }, 450);
    return () => clearInterval(id);
  }, [running, over]);

  useEffect(() => {
    spawn();
    draw();
  }, []);

  const nudge = (dx: number, dy: number) => {
    if (!running || over) return;
    const p = piece.current;
    if (!collides(p.x + dx, p.y + dy, p.shape)) {
      p.x += dx;
      p.y += dy;
      draw();
    } else if (dy > 0) merge();
  };

  return (
    <div className="lounge-game">
      <p className="muted">
        {t("tetris")} · {score} {over ? "· GAME OVER" : ""}
      </p>
      <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} className="lounge-canvas" />
      <div className="bridge-actions">
        <button type="button" className="hud-btn amber" onClick={() => (over ? (reset(), setRunning(true)) : setRunning((r) => !r))}>
          {running ? t("pause") : t("start")}
        </button>
        <button type="button" className="hud-btn" onClick={() => nudge(-1, 0)}>
          ←
        </button>
        <button type="button" className="hud-btn" onClick={() => nudge(0, 1)}>
          ↓
        </button>
        <button type="button" className="hud-btn" onClick={() => nudge(1, 0)}>
          →
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            const p = piece.current;
            const rot = rotate(p.shape);
            if (!collides(p.x, p.y, rot)) {
              p.shape = rot;
              draw();
            }
          }}
        >
          ↻
        </button>
      </div>
    </div>
  );
}
