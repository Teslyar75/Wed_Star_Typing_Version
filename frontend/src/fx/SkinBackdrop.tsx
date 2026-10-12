import { useEffect, useRef } from "react";
import { SkinBackdropScene, type BgEngine } from "./skinScene";
import type { SpaceProfile } from "./livingSpace";

type Props = {
  themeId: string;
  engine: BgEngine;
  profile?: SpaceProfile;
  className?: string;
};

/** Фото-фон скина + лёгкий FX (sonar/gears/rain/…). */
export default function SkinBackdrop({ themeId, engine, profile = "light", className = "space-canvas" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d", { alpha: false });
    if (!ctx) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    const scene = new SkinBackdropScene(c.clientWidth || 800, window.innerHeight || 600, themeId, engine);
    let alive = true;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const targetDt = profile === "full" ? 1 / 20 : profile === "frost" ? 1 / 4 : 1 / 10;

    const paint = () => {
      const w = c.clientWidth;
      const h = window.innerHeight;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        scene.resize(w, h);
      }
      scene.draw(ctx);
    };

    const frame = (now: number) => {
      if (!alive) return;
      const raw = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += raw;
      if (!reduced && !document.hidden) {
        while (acc >= targetDt) {
          scene.step(targetDt);
          acc -= targetDt;
        }
        paint();
        raf = requestAnimationFrame(frame);
      } else {
        paint();
      }
    };

    const kick = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      acc = 0;
      scene.setTheme(themeId, engine);
      if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
      else paint();
    };

    kick();
    const onVis = () => kick();
    const onMotion = () => {
      reduced = mq.matches;
      kick();
    };
    document.addEventListener("visibilitychange", onVis);
    mq.addEventListener?.("change", onMotion);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", onMotion);
    };
  }, [themeId, engine, profile]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
