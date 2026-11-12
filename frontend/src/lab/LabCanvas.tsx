/** Canvas 2D рендер сущности и звёзд — лёгкий LOD, throttle redraw. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { LabGraphPayload, LabNode, Neighborhood } from "./labApi";
import {
  FRAME_MS,
  INERTIA_DECAY,
  INERTIA_MIN,
  ROT_SPEED,
  blend,
  clampPitch,
  projectPoint,
  skillColor,
} from "./labMath";

export type Cam = {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
  viewOx: number;
  viewOy: number;
  yawVel: number;
  pitchVel: number;
};

export type LabCanvasHandle = {
  starAt: (mx: number, my: number) => LabNode | null;
  canvas: HTMLCanvasElement | null;
};

type Props = {
  graph: LabGraphPayload | null;
  mode: "visual" | "work";
  cam: Cam;
  onCam: (c: Cam) => void;
  selection: Neighborhood | null;
  selectedId: string | null;
  dragging: boolean;
  reducedMotion?: boolean;
};

const PANEL = "#0b1220";
const PURPLE = "#a78bfa";

const LabCanvas = forwardRef<LabCanvasHandle, Props>(function LabCanvas(
  { graph, mode, cam, onCam, selection, selectedId, dragging, reducedMotion },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const screenXy = useRef<[number, number][]>([]);
  const t0 = useRef(performance.now());
  const lastTick = useRef(performance.now());
  const camRef = useRef(cam);
  const onCamRef = useRef(onCam);
  const graphRef = useRef(graph);
  const modeRef = useRef(mode);
  const selRef = useRef(selection);
  const selIdRef = useRef(selectedId);
  const dragRef = useRef(dragging);
  const lod = useRef(1);
  const frame = useRef(0);

  camRef.current = cam;
  onCamRef.current = onCam;
  graphRef.current = graph;
  modeRef.current = mode;
  selRef.current = selection;
  selIdRef.current = selectedId;
  dragRef.current = dragging;

  const starAt = (mx: number, my: number): LabNode | null => {
    const g = graphRef.current;
    if (!g) return null;
    const r2 = 12 * 12;
    let best: number | null = null;
    let bd = r2;
    for (let i = 0; i < screenXy.current.length; i++) {
      const [sx, sy] = screenXy.current[i]!;
      const d = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d < bd) {
        best = i;
        bd = d;
      }
    }
    return best == null ? null : g.nodes[best] ?? null;
  };

  useImperativeHandle(ref, () => ({
    starAt,
    canvas: canvasRef.current,
  }));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let alive = true;
    let raf = 0;
    let acc = 0;
    let last = performance.now();

    const paintBg = (w: number, h: number, now: number) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.48, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      const pulse = 0.5 + 0.5 * Math.sin((now - t0.current) / 1800);
      g.addColorStop(0, `rgba(88, 56, 140, ${0.22 + 0.08 * pulse})`);
      g.addColorStop(0.45, "rgba(18, 28, 56, 0.85)");
      g.addColorStop(1, PANEL);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const a = (i * 2.399) % (Math.PI * 2);
        const r = 40 + ((i * 17) % Math.min(w, h)) * 0.45;
        const x = w * 0.5 + Math.cos(a + now / 9000) * r;
        const y = h * 0.5 + Math.sin(a * 0.9 + now / 11000) * r * 0.7;
        ctx.fillStyle = `rgba(120, 160, 220, ${0.015 + (i % 5) * 0.004})`;
        ctx.beginPath();
        ctx.arc(x, y, 18 + (i % 7) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawEntity = (cx: number, cy: number, R: number, now: number, camC: Cam) => {
      const g = graphRef.current;
      if (!g) return;
      const e = g.entity;
      const v = e.vitality;
      const quiet = e.quiet_days ?? 0;
      const mist = quiet < 0 ? 0 : Math.min(0.55, Math.max(0, (quiet - 2) / 14));
      const speed = 0.55 + 1.6 * v;
      const t = ((now - t0.current) / 1000) * speed;
      const breath = Math.sin(t);
      const [ex0, ey0, depth] = projectPoint(0, 0, 0, {
        yaw: camC.yaw,
        pitch: camC.pitch,
        zoom: camC.zoom,
        panX: camC.panX,
        panY: camC.panY,
        cx,
        cy,
        R,
        viewOx: camC.viewOx,
        viewOy: camC.viewOy,
      });
      const wobX = Math.sin(t * 0.7) * 3 * (0.35 + 0.65 * v);
      const wobY = Math.cos(t * 0.55) * 2.5 * (0.35 + 0.65 * v);
      const ex = ex0 + wobX;
      const ey = ey0 + wobY;
      const r0 = 8 * (1 + 0.08 * Math.min(e.growth, 8)) * (0.85 + 0.25 * depth) * Math.sqrt(camC.zoom);
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.9);
      const core = blend(PURPLE, "#4fd1c5", 0.25 * shimmer * v);
      const specs: [number, string, number][] = [
        [2.8, blend(PANEL, PURPLE, 0.18 * (1 - mist) + 0.06), 0.35],
        [1.9, blend(PANEL, core, 0.18 * (1 - mist)), 0.5],
        [1.35, blend(PANEL, core, 0.4 * (0.5 + 0.5 * v)), 0.7],
        [0.95, blend(PANEL, core, 0.8 * (0.45 + 0.55 * v)), 1],
      ];
      for (const [mul, fill, amp] of specs) {
        const rx = r0 * mul * (1 + 0.08 * v * breath * amp);
        const ry = r0 * mul * (0.82 + 0.08 * v * Math.cos(t * 1.1) * amp);
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }
      for (let oi = 0; oi < 3; oi++) {
        const oa = t * (0.8 + 0.2 * oi) + oi * 2.1;
        const orad = r0 * (1.8 + 0.35 * oi) * (0.85 + 0.15 * v);
        const ox = ex + orad * Math.cos(oa);
        const oy = ey + orad * Math.sin(oa) * 0.75;
        const s = 2.2 * (0.7 + 0.5 * v) * (1 + 0.1 * Math.sin(t + oi));
        ctx.beginPath();
        ctx.arc(ox, oy, s, 0, Math.PI * 2);
        ctx.fillStyle = blend(PANEL, skillColor(["en", "read", "type"][oi]!), 0.35 + 0.4 * v);
        ctx.fill();
      }
    };

    const place = (now: number) => {
      const g = graphRef.current;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w < 2 || h < 2) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      paintBg(w, h, now);
      if (!g || !g.nodes.length) {
        ctx.fillStyle = "rgba(200,208,224,0.7)";
        ctx.font = "14px system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Лаборатория ждёт первых знаний", w / 2, h / 2);
        screenXy.current = [];
        return;
      }
      const camC = camRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.38;
      const xy: [number, number][] = [];
      const dep: number[] = [];
      for (let i = 0; i < g.nodes.length; i++) {
        const [x, y, z] = g.positions[i] ?? [0, 0, 0];
        const [sx, sy, depth] = projectPoint(x, y, z, {
          yaw: camC.yaw,
          pitch: camC.pitch,
          zoom: camC.zoom,
          panX: camC.panX,
          panY: camC.panY,
          cx,
          cy,
          R,
          viewOx: camC.viewOx,
          viewOy: camC.viewOy,
        });
        xy.push([sx, sy]);
        dep.push(depth);
      }
      screenXy.current = xy;

      const sel = selRef.current;
      const hasSel = Boolean(selIdRef.current);
      const hiIds = new Set<string>();
      const hiEdges = new Set<string>();
      if (sel) {
        hiIds.add(sel.selected.id);
        for (const n of sel.neighbors) hiIds.add(n.id);
        for (const [a, b] of sel.edges) hiEdges.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }

      ctx.lineWidth = 1;
      for (const [a, b] of g.edges) {
        const ia = g.nodes.findIndex((n) => n.id === a);
        const ib = g.nodes.findIndex((n) => n.id === b);
        if (ia < 0 || ib < 0) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const alpha = hasSel ? (hiEdges.has(key) ? 0.55 : 0.05) : 0.18;
        ctx.strokeStyle = `rgba(160,180,220,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(xy[ia]![0], xy[ia]![1]);
        ctx.lineTo(xy[ib]![0], xy[ib]![1]);
        ctx.stroke();
      }

      for (let i = 0; i < g.nodes.length; i++) {
        const n = g.nodes[i]!;
        const depth = dep[i]!;
        const fresh = n.fresh ?? 0.55;
        let s =
          (n.kind === "cluster" || n.kind === "book" ? 5.5 : 3.2) *
          (0.7 + 0.55 * depth) *
          Math.sqrt(camC.zoom);
        let col: string;
        let stroke = false;
        if (hasSel) {
          if (n.id === selIdRef.current) {
            col = blend(PANEL, skillColor(n.skill), 0.95);
            s *= 1.35;
            stroke = true;
          } else if (hiIds.has(n.id)) {
            col = blend(PANEL, skillColor(n.skill), 0.55 + 0.35 * fresh);
          } else {
            col = blend(PANEL, skillColor(n.skill), 0.12 + 0.18 * fresh);
            s *= 0.75;
          }
        } else {
          col = blend(PANEL, skillColor(n.skill), (0.2 + 0.55 * depth) * (0.25 + 0.75 * fresh));
        }
        const [x, y] = xy[i]!;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = PURPLE;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      drawEntity(cx, cy, R, now, camC);
    };

    const step = (now: number) => {
      const dt = Math.min(0.2, (now - lastTick.current) / 1000);
      lastTick.current = now;
      let camC = { ...camRef.current };
      if (!dragRef.current) {
        if (Math.abs(camC.yawVel) > INERTIA_MIN || Math.abs(camC.pitchVel) > INERTIA_MIN) {
          camC.yaw += camC.yawVel;
          camC.pitch = clampPitch(camC.pitch + camC.pitchVel);
          camC.yawVel *= INERTIA_DECAY;
          camC.pitchVel *= INERTIA_DECAY;
          onCamRef.current(camC);
        } else if (modeRef.current === "visual" && !selIdRef.current && !reducedMotion) {
          camC = { ...camC, yaw: camC.yaw + ROT_SPEED * dt * lod.current };
          onCamRef.current(camC);
        }
      }
      frame.current += 1;
      if (frame.current % lod.current === 0) place(now);
    };

    const loop = (now: number) => {
      if (!alive) return;
      if (!document.hidden) {
        const raw = Math.min(0.05, (now - last) / 1000);
        last = now;
        acc += raw;
        while (acc >= FRAME_MS / 1000) {
          step(performance.now());
          acc -= FRAME_MS / 1000;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    place(performance.now());
    raf = requestAnimationFrame(loop);
    const onResize = () => place(performance.now());
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [reducedMotion]);

  useEffect(() => {
    // cam/graph changes picked up via refs in animation loop
  }, [graph, selection, selectedId, cam]);

  return (
    <div className="lab-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="lab-canvas"
        data-testid="lab-canvas"
        onMouseMove={(e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const n = starAt(mx, my);
          const tip = tipRef.current;
          if (!tip) return;
          if (!n || dragging) {
            tip.hidden = true;
            return;
          }
          tip.hidden = false;
          tip.style.left = `${mx + 12}px`;
          tip.style.top = `${my + 12}px`;
          tip.textContent = `${n.label} · яркость ${Math.round((n.fresh ?? 0) * 100)} %`;
        }}
        onMouseLeave={() => {
          if (tipRef.current) tipRef.current.hidden = true;
        }}
      />
      <div ref={tipRef} className="lab-tip" hidden />
    </div>
  );
});

export default LabCanvas;
