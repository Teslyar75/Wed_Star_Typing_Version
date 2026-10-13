/** Арканоид — паритет stamina/lounge/breakout.py (BRICK 5×10, GameShell). */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import GameShell from "./GameShell";
import { useFieldSize } from "./useFieldSize";

const BRICK_ROWS = 5;
const BRICK_COLS = 10;
const COLORS = ["#e85d5d", "#f0a030", "#3dba7a", "#3ec6e0", "#a78bfa"];

type Brick = { r: number; c: number; alive: boolean; color: string };
type Props = {
  record?: number;
  onLobby: () => void;
  onScore?: (score: number) => void;
};

export default function BreakoutGame({ record = 0, onLobby, onScore }: Props) {
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [over, setOver] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const field = useFieldSize(wrapRef);
  const fieldRef = useRef(field);
  fieldRef.current = field;
  const paddleX = useRef(0.5);
  const paddleW = 0.16;
  const ball = useRef({ x: 0.5, y: 0.85, vx: 0, vy: 0 });
  const launched = useRef(false);
  const bricks = useRef<Brick[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const keys = useRef({ left: false, right: false });
  const pausedRef = useRef(false);
  const overRef = useRef(false);

  const resetBricks = () => {
    const list: Brick[] = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        list.push({ r, c, alive: true, color: COLORS[r % COLORS.length]! });
      }
    }
    bricks.current = list;
  };

  const resetBall = () => {
    launched.current = false;
    ball.current = { x: paddleX.current, y: 0.88, vx: 0, vy: 0 };
  };

  const reset = () => {
    paddleX.current = 0.5;
    scoreRef.current = 0;
    livesRef.current = 3;
    setScore(0);
    setLives(3);
    setOver(false);
    overRef.current = false;
    setPaused(false);
    pausedRef.current = false;
    resetBricks();
    resetBall();
  };

  const launch = () => {
    if (launched.current || overRef.current) return;
    const angle = (Math.random() - 0.5) * 1.2;
    const speed = 0.011;
    ball.current.vx = Math.sin(angle) * speed;
    ball.current.vy = -Math.abs(Math.cos(angle) * speed);
    launched.current = true;
    setPaused(false);
    pausedRef.current = false;
  };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = fieldRef.current.w;
    const H = fieldRef.current.h;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    ctx.fillStyle = "#0e1620";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(120,160,180,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // desktop: top = h*0.12, bh = h*0.055, bw = (w-20)//COLS, x0 = 10 + c*bw
    const top = Math.floor(H * 0.12);
    const bh = Math.floor(H * 0.055);
    const bw = Math.floor((W - 20) / BRICK_COLS);
    for (const b of bricks.current) {
      if (!b.alive) continue;
      const x0 = 10 + b.c * bw;
      const y0 = top + b.r * bh;
      ctx.fillStyle = b.color;
      ctx.fillRect(x0 + 1, y0 + 1, bw - 3, bh - 3);
    }

    const pw = Math.floor(W * paddleW);
    const px0 = Math.floor(paddleX.current * W - pw / 2);
    const py0 = Math.floor(H * 0.92);
    ctx.fillStyle = "#3ec6e0";
    ctx.fillRect(px0, py0, pw, Math.max(8, Math.floor(H * 0.015)));

    const br = Math.max(5, Math.min(W, H) * 0.012);
    ctx.beginPath();
    ctx.arc(ball.current.x * W, ball.current.y * H, br, 0, Math.PI * 2);
    ctx.fillStyle = "#f0a030";
    ctx.fill();

    // жизни — красные круги внизу слева (breakout.py)
    for (let i = 0; i < livesRef.current; i++) {
      ctx.beginPath();
      ctx.arc(16 + i * 18, H - 16, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#e85d5d";
      ctx.fill();
    }

    if (!launched.current && !overRef.current && !pausedRef.current) {
      ctx.fillStyle = "rgba(160,180,200,0.75)";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("lounge_press_space"), W / 2, Math.floor(H * 0.7));
    }

    if (overRef.current || pausedRef.current) {
      ctx.fillStyle = "rgba(8, 12, 18, 0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f0a030";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const msg = overRef.current ? t("lounge_breakout_over") : t("lounge_pause");
      const lines = msg.split("\n");
      const lh = 32;
      const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((line, i) => ctx.fillText(line, W / 2, y0 + i * lh));
    }
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
    reset();
    draw();
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
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
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        launch();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        keys.current.left = true;
        /* движение только в тике — иначе key-repeat + interval дёргают поле/платформу */
        if (!launched.current) ball.current.x = paddleX.current;
        return;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        keys.current.right = true;
        if (!launched.current) ball.current.x = paddleX.current;
        return;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.current.right = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!running || paused || over) return;
    const id = window.setInterval(() => {
      const step = 0.018;
      if (keys.current.left) paddleX.current = Math.max(paddleW / 2, paddleX.current - step);
      if (keys.current.right) paddleX.current = Math.min(1 - paddleW / 2, paddleX.current + step);

      if (!launched.current) {
        ball.current.x = paddleX.current;
        ball.current.y = 0.88;
        draw();
        return;
      }

      const b = ball.current;
      b.x += b.vx;
      b.y += b.vy;
      if (b.x <= 0.02) {
        b.x = 0.02;
        b.vx = Math.abs(b.vx);
      } else if (b.x >= 0.98) {
        b.x = 0.98;
        b.vx = -Math.abs(b.vx);
      }
      if (b.y <= 0.03) {
        b.y = 0.03;
        b.vy = Math.abs(b.vy);
      }

      const py = 0.92;
      if (b.vy > 0 && Math.abs(b.y - py) < 0.03) {
        if (Math.abs(b.x - paddleX.current) <= paddleW / 2 + 0.01) {
          const offset = (b.x - paddleX.current) / (paddleW / 2);
          b.vy = -Math.abs(b.vy);
          b.vx = Math.max(-0.018, Math.min(0.018, b.vx + offset * 0.008));
          const sp = Math.hypot(b.vx, b.vy);
          if (sp < 0.02) {
            b.vx *= 1.03;
            b.vy *= 1.03;
          }
        }
      }

      if (b.y > 1.02) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        resetBall();
        if (livesRef.current <= 0) {
          overRef.current = true;
          setOver(true);
          setRunning(false);
          pausedRef.current = true;
          setPaused(true);
          onScore?.(scoreRef.current);
        }
        draw();
        return;
      }

      const bw = 1 / BRICK_COLS;
      const bh = 0.06;
      const top = 0.12;
      for (const brk of bricks.current) {
        if (!brk.alive) continue;
        const x0 = brk.c * bw;
        const y0 = top + brk.r * bh;
        if (b.x >= x0 && b.x <= x0 + bw && b.y >= y0 && b.y <= y0 + bh * 0.9) {
          brk.alive = false;
          b.vy = -b.vy;
          scoreRef.current += 10 + brk.r * 5;
          setScore(scoreRef.current);
          if (bricks.current.every((x) => !x.alive)) {
            scoreRef.current += 200;
            setScore(scoreRef.current);
            for (const x of bricks.current) x.alive = true;
            b.vx *= 1.1;
            b.vy *= 1.1;
          }
          break;
        }
      }
      draw();
    }, 16);
    return () => clearInterval(id);
    // field size читается через fieldRef — не перезапускаем тик при ResizeObserver
  }, [running, paused, over, onScore]);

  useEffect(() => {
    draw();
  }, [field.w, field.h, paused, over, score, lives]);

  return (
    <GameShell
      title={t("lounge_breakout_title")}
      hint={t("lounge_breakout_hint")}
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
        <canvas
          ref={canvasRef}
          className="lounge-canvas game-canvas"
          aria-label="breakout"
          onClick={() => launch()}
          onTouchMove={(e) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = (e.touches[0]!.clientX - rect.left) / rect.width;
            paddleX.current = Math.max(paddleW / 2, Math.min(1 - paddleW / 2, x));
            if (!launched.current) ball.current.x = paddleX.current;
            draw();
          }}
        />
      </div>
    </GameShell>
  );
}
