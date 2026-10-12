import { useEffect, useRef } from "react";
import { LivingSpaceScene, type SpaceProfile } from "./livingSpace";

type Props = { profile?: SpaceProfile; className?: string; fullBleed?: boolean };

/** Живой космос (порт living_space.py) — пауза при hidden / reduced-motion. */
export default function SpaceCanvas({ profile = "light", className = "space-canvas", fullBleed }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mode: SpaceProfile = reduced ? "light" : profile;
    const scene = new LivingSpaceScene(c.clientWidth || 800, c.clientHeight || 180, mode);
    let alive = true;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const targetDt = mode === "full" ? 1 / 24 : 1 / 12;

    const frame = (now: number) => {
      if (!alive) return;
      const raw = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += raw;
      const w = c.clientWidth;
      const h = fullBleed ? window.innerHeight : c.clientHeight || 180;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        scene.resize(w, h);
      }
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--st-bg").trim() || "#03060c";
      if (!reduced && !document.hidden) {
        while (acc >= targetDt) {
          scene.step(targetDt, 1);
          acc -= targetDt;
        }
      }
      scene.draw(ctx, bg);
      if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (!document.hidden && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const onResize = () => {
      /* next frame picks size */
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, [profile, fullBleed]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
