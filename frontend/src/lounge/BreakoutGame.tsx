import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

const W = 320;
const H = 240;
const BW = 40;
const BH = 10;

type Props = { onScore?: (score: number) => void };

export default function BreakoutGame({ onScore }: Props) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paddle = useRef({ x: W / 2 - BW / 2 });
  const ball = useRef({ x: W / 2, y: H - 40, vx: 2.2, vy: -2.4 });
  const bricks = useRef<{ x: number; y: number; alive: boolean }[]>([]);
  const scoreRef = useRef(0);
  const keys = useRef({ left: false, right: false });

  const resetBricks = () => {
    const rows = 4;
    const cols = 8;
    const list = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        list.push({ x: 8 + c * 38, y: 20 + r * 16, alive: true });
      }
    }
    bricks.current = list;
  };

  const reset = () => {
    paddle.current.x = W / 2 - BW / 2;
    ball.current = { x: W / 2, y: H - 40, vx: 2.2, vy: -2.4 };
    scoreRef.current = 0;
    setScore(0);
    setOver(false);
    resetBricks();
  };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a1218";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f0a030";
    ctx.fillRect(paddle.current.x, H - 18, BW, BH);
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, 5, 0, Math.PI * 2);
    ctx.fill();
    for (const b of bricks.current) {
      if (!b.alive) continue;
      ctx.fillStyle = "#3a8";
      ctx.fillRect(b.x, b.y, 34, 12);
    }
  };

  useEffect(() => {
    reset();
    draw();
  }, []);

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
      if (e.key === "ArrowLeft" || e.key === "a") keys.current.left = e.type === "keydown";
      if (e.key === "ArrowRight" || e.key === "d") keys.current.right = e.type === "keydown";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [over]);

  useEffect(() => {
    if (!running || over) return;
    const id = window.setInterval(() => {
      if (keys.current.left) paddle.current.x = Math.max(0, paddle.current.x - 5);
      if (keys.current.right) paddle.current.x = Math.min(W - BW, paddle.current.x + 5);
      const b = ball.current;
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < 5 || b.x > W - 5) b.vx *= -1;
      if (b.y < 5) b.vy *= -1;
      if (b.y > H - 22 && b.x > paddle.current.x && b.x < paddle.current.x + BW) {
        b.vy = -Math.abs(b.vy);
        b.vx += (b.x - (paddle.current.x + BW / 2)) * 0.08;
      }
      for (const br of bricks.current) {
        if (!br.alive) continue;
        if (b.x > br.x && b.x < br.x + 34 && b.y > br.y && b.y < br.y + 12) {
          br.alive = false;
          b.vy *= -1;
          scoreRef.current += 10;
          setScore(scoreRef.current);
        }
      }
      if (b.y > H) {
        setOver(true);
        setRunning(false);
        onScore?.(scoreRef.current);
      }
      if (bricks.current.every((x) => !x.alive)) {
        setOver(true);
        setRunning(false);
        scoreRef.current += 100;
        setScore(scoreRef.current);
        onScore?.(scoreRef.current);
      }
      draw();
    }, 16);
    return () => clearInterval(id);
  }, [running, over, onScore]);

  return (
    <div className="lounge-game">
      <p className="muted">
        {t("breakout")} · {score} {over ? "· GAME OVER" : ""}
      </p>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="lounge-canvas"
        onTouchMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.touches[0]!.clientX - rect.left;
          paddle.current.x = Math.max(0, Math.min(W - BW, x - BW / 2));
        }}
      />
      <div className="bridge-actions">
        <button type="button" className="hud-btn amber" onClick={() => (over ? (reset(), setRunning(true)) : setRunning((r) => !r))}>
          {running ? t("pause") : t("start")}
        </button>
        <button type="button" className="hud-btn" onClick={() => (paddle.current.x = Math.max(0, paddle.current.x - 20))}>
          ←
        </button>
        <button type="button" className="hud-btn" onClick={() => (paddle.current.x = Math.min(W - BW, paddle.current.x + 20))}>
          →
        </button>
      </div>
    </div>
  );
}
