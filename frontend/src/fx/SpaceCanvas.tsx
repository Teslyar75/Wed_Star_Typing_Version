import { useEffect, useRef } from "react";
import { LivingSpaceScene, type SpaceProfile } from "./livingSpace";

type Props = { profile?: SpaceProfile; className?: string; fullBleed?: boolean };

/** Живой космос — light 8 fps, full 24 fps; freeze при reduced-motion / hidden. */
export default function SpaceCanvas({ profile = "light", className = "space-canvas", fullBleed }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d", { alpha: false });
    if (!ctx) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    const mode: SpaceProfile = reduced ? "light" : profile;
    const scene = new LivingSpaceScene(c.clientWidth || 800, c.clientHeight || 180, mode);
    let alive = true;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    // light ≈ 8 fps (меньше CPU), full ≈ 24 fps
    const targetDt = mode === "full" ? 1 / 24 : 1 / 8;

    const paint = () => {
      const w = c.clientWidth;
      const h = fullBleed ? window.innerHeight : c.clientHeight || 180;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        scene.resize(w, h);
      }
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--st-bg").trim() || "#03060c";
      scene.draw(ctx, bg);
    };

    const frame = (now: number) => {
      if (!alive) return;
      const raw = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += raw;
      if (!reduced && !document.hidden) {
        while (acc >= targetDt) {
          scene.step(targetDt, 1);
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
    mq.addListener?.(onMotion);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", onMotion);
      mq.removeListener?.(onMotion);
    };
  }, [profile, fullBleed]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
