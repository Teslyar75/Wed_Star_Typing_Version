/** Тетрис — паритет stamina/lounge/tetris.py (поле на весь экран). */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import GameShell from "./GameShell";
import { useFieldSize } from "./useFieldSize";

const COLS = 10;
const ROWS = 20;

const SHAPES: Record<string, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS: Record<string, string> = {
  I: "#3ec6e0",
  O: "#f0a030",
  T: "#a78bfa",
  S: "#3dba7a",
  Z: "#e85d5d",
  J: "#4C8CFF",
  L: "#FF8C4C",
};

const LINE_PTS: Record<number, number> = { 1: 100, 2: 300, 3: 500, 4: 800 };

type Cell = string | null;
type Piece = { kind: string; shape: number[][]; color: string };

type Props = {
  record?: number;
  onLobby: () => void;
  onScore?: (score: number) => void;
};

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotate(m: number[][]) {
  const h = m.length;
  const w = m[0]!.length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x]![h - 1 - y] = m[y]![x]!;
  return out;
}

function blend(hex: string, bg: string, tAmt: number) {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    const n = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  const a = parse(hex);
  const b = parse(bg);
  const m = a.map((v, i) => Math.round(v * (1 - tAmt) + b[i]! * tAmt));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

export default function TetrisGame({ record = 0, onLobby, onScore }: Props) {
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [over, setOver] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const field = useFieldSize(wrapRef);
  const board = useRef(emptyBoard());
  const piece = useRef<Piece | null>(null);
  const px = useRef(0);
  const py = useRef(0);
  const bag = useRef<string[]>([]);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const linesRef = useRef(0);

  const hits = (x: number, y: number, shape: number[][]) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r]!.length; c++) {
        if (!shape[r]![c]) continue;
        const nx = x + c;
        const ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board.current[ny]![nx]) return true;
      }
    }
    return false;
  };

  const nextKind = () => {
    if (!bag.current.length) {
      bag.current = Object.keys(SHAPES);
      for (let i = bag.current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag.current[i], bag.current[j]] = [bag.current[j]!, bag.current[i]!];
      }
    }
    return bag.current.pop()!;
  };

  const spawn = () => {
    const kind = nextKind();
    const shape = SHAPES[kind]!.map((row) => row.slice());
    const color = COLORS[kind]!;
    piece.current = { kind, shape, color };
    px.current = Math.floor((COLS - shape[0]!.length) / 2);
    py.current = 0;
    if (hits(px.current, py.current, shape)) {
      setOver(true);
      setRunning(false);
      setPaused(true);
      onScore?.(scoreRef.current);
    }
  };

  const lock = () => {
    const p = piece.current;
    if (!p) return;
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r]!.length; c++) {
        if (!p.shape[r]![c] || py.current + r < 0) continue;
        board.current[py.current + r]![px.current + c] = p.color;
      }
    }
    let cleared = 0;
    board.current = board.current.filter((row) => {
      if (row.every((cell) => cell)) {
        cleared++;
        return false;
      }
      return true;
    });
    while (board.current.length < ROWS) board.current.unshift(Array(COLS).fill(null));
    if (cleared) {
      const pts = (LINE_PTS[cleared] ?? cleared * 200) * levelRef.current;
      scoreRef.current += pts;
      linesRef.current += cleared;
      levelRef.current = 1 + Math.floor(linesRef.current / 10);
      setScore(scoreRef.current);
      setLines(linesRef.current);
      setLevel(levelRef.current);
    }
    spawn();
  };

  const reset = () => {
    board.current = emptyBoard();
    bag.current = [];
    scoreRef.current = 0;
    levelRef.current = 1;
    linesRef.current = 0;
    setScore(0);
    setLevel(1);
    setLines(0);
    setOver(false);
    setPaused(false);
    spawn();
  };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = field.w;
    const h = field.h;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const bg = "#0a1218";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const pad = 20;
    const cell = Math.max(12, Math.min(Math.floor((w - pad * 2) / COLS), Math.floor((h - pad * 2) / ROWS)));
    const gw = cell * COLS;
    const gh = cell * ROWS;
    const ox = Math.floor((w - gw) / 2);
    const oy = Math.floor((h - gh) / 2);
    ctx.strokeStyle = "rgba(120,160,180,0.35)";
    ctx.strokeRect(ox + 0.5, oy + 0.5, gw - 1, gh - 1);

    const paint = (x: number, y: number, color: string, ghost = false) => {
      if (y < 0) return;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
      if (!ghost) {
        ctx.strokeStyle = blend(color, "#1a2430", 0.35);
        ctx.strokeRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
      }
    };

    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const col = board.current[y]![x];
        if (col) paint(x, y, col);
      }

    const p = piece.current;
    if (p && !over) {
      let gy = py.current;
      while (!hits(px.current, gy + 1, p.shape)) gy++;
      for (let r = 0; r < p.shape.length; r++)
        for (let c0 = 0; c0 < p.shape[r]!.length; c0++)
          if (p.shape[r]![c0]) paint(px.current + c0, gy + r, blend(p.color, bg, 0.75), true);
      for (let r = 0; r < p.shape.length; r++)
        for (let c0 = 0; c0 < p.shape[r]!.length; c0++)
          if (p.shape[r]![c0]) paint(px.current + c0, py.current + r, p.color);
    }

    // desktop tetris.py: text справа от колодца «УР. {0}\nЛИНИИ {1}»
    ctx.fillStyle = "#e8f0ff";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${t("lounge_level")} ${levelRef.current}`, ox + gw + 12, oy + 8);
    ctx.fillText(`${t("lounge_lines")} ${linesRef.current}`, ox + gw + 12, oy + 28);

    if (over || paused) {
      ctx.fillStyle = "rgba(8, 12, 18, 0.55)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f0a030";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const msg = over ? t("lounge_tetris_over") : t("lounge_pause");
      const lines = msg.split("\n");
      const lh = 32;
      const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, y0 + i * lh));
    }
  };

  const tryRotate = () => {
    const p = piece.current;
    if (!p || !running || paused || over) return;
    const rot = rotate(p.shape);
    if (!hits(px.current, py.current, rot)) {
      p.shape = rot;
    } else if (!hits(px.current - 1, py.current, rot)) {
      px.current -= 1;
      p.shape = rot;
    } else if (!hits(px.current + 1, py.current, rot)) {
      px.current += 1;
      p.shape = rot;
    }
    draw();
  };

  const togglePause = () => {
    if (over) {
      reset();
      setRunning(true);
      setPaused(false);
      draw();
      return;
    }
    setPaused((p) => !p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        reset();
        setRunning(true);
        setPaused(false);
        draw();
        return;
      }
      if (!running || paused || over || !piece.current) return;
      const p = piece.current;
      if (e.key === "ArrowLeft" && !hits(px.current - 1, py.current, p.shape)) {
        e.preventDefault();
        px.current -= 1;
      }
      if (e.key === "ArrowRight" && !hits(px.current + 1, py.current, p.shape)) {
        e.preventDefault();
        px.current += 1;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!hits(px.current, py.current + 1, p.shape)) {
          py.current += 1;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        } else lock();
      }
      if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        tryRotate();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        while (!hits(px.current, py.current + 1, p.shape)) {
          py.current += 1;
          scoreRef.current += 2;
        }
        setScore(scoreRef.current);
        lock();
      }
      draw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!running || paused || over) return;
    const ms = Math.max(80, 480 - levelRef.current * 35);
    const id = window.setInterval(() => {
      const p = piece.current;
      if (!p) return;
      if (!hits(px.current, py.current + 1, p.shape)) py.current += 1;
      else lock();
      draw();
    }, ms);
    return () => clearInterval(id);
  }, [running, paused, over, level, field.w, field.h]);

  useEffect(() => {
    reset();
    draw();
  }, []);

  useEffect(() => {
    draw();
  }, [field.w, field.h, paused, over, score, level, lines]);

  return (
    <GameShell
      title={t("lounge_tetris_title")}
      hint={t("lounge_tetris_hint")}
      score={score}
      record={Math.max(record, score)}
      paused={paused}
      over={over}
      onTogglePause={togglePause}
      onRestart={() => {
        reset();
        setRunning(true);
        setPaused(false);
        draw();
      }}
      onLobby={onLobby}
    >
      <div ref={wrapRef} className="game-shell-field-fill">
        <canvas ref={canvasRef} className="lounge-canvas game-canvas" aria-label="tetris" />
      </div>
    </GameShell>
  );
}
