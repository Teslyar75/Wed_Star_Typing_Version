import { useEffect, useRef } from "react";

/** Лёгкий «живой космос» на Canvas (фаза 7). */
export default function SpaceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.3 + Math.random() * 1.5,
    }));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const draw = () => {
      if (!alive) return;
      const w = (c.width = c.clientWidth);
      const h = (c.height = 140);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--st-bg") || "#03060c";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#dff";
      for (const s of stars) {
        if (!reduced) s.x -= 0.0015 * s.z;
        if (s.x < 0) s.x = 1;
        ctx.globalAlpha = 0.4 + s.z * 0.3;
        ctx.fillRect(s.x * w, s.y * h, s.z, s.z);
      }
      ctx.globalAlpha = 1;
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };
    draw();
    const onVis = () => {
      if (!document.hidden && !reduced) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="space-canvas" aria-hidden />;
}
