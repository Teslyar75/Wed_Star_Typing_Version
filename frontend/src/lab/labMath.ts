/** Камера и проекция Лаборатории — порт stamina/laboratory.py (чистые функции). */

export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 4.0;
export const ZOOM_STEP = 1.12;
export const WORK_ZOOM = 1.55;
export const PITCH_MAX = 1.15;
export const DRAG_CLICK_PX = 5;
export const ORBIT_SENS = 0.007;
export const INERTIA_DECAY = 0.92;
export const INERTIA_MIN = 0.0004;
export const ROT_SPEED = 0.008;
export const VIEW_THROTTLE_MS = 33;
export const FRAME_MS = 33;

export function rotateXyz(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y2, z2];
}

export function projectPoint(
  x: number,
  y: number,
  z: number,
  opts: {
    yaw: number;
    pitch: number;
    zoom: number;
    panX: number;
    panY: number;
    cx: number;
    cy: number;
    R: number;
    viewOx?: number;
    viewOy?: number;
  },
): [number, number, number] {
  const [rx, ry, rz] = rotateXyz(x + opts.panX, y + opts.panY, z, opts.yaw, opts.pitch);
  const depth = 1.0 / Math.max(0.45, 1.0 + rz * 0.42);
  const sx = opts.cx + rx * opts.zoom * opts.R * depth + (opts.viewOx ?? 0);
  const sy = opts.cy + ry * opts.zoom * opts.R * 0.86 * depth + (opts.viewOy ?? 0);
  return [sx, sy, depth];
}

export function clampPitch(p: number): number {
  return Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));
}

/** Зум к курсору: точка под курсором неподвижна (инвариант). */
export function zoomToward(
  zoom: number,
  viewOx: number,
  viewOy: number,
  factor: number,
  cursorXy: [number, number],
  originXy: [number, number],
): [number, number, number] {
  const old = zoom;
  const neu = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, old * factor));
  if (Math.abs(neu - old) < 1e-9 || Math.abs(old) < 1e-12) return [old, viewOx, viewOy];
  const [mx, my] = cursorXy;
  const [cx, cy] = originXy;
  const qx = (mx - cx - viewOx) / old;
  const qy = (my - cy - viewOy) / old;
  return [neu, mx - cx - qx * neu, my - cy - qy * neu];
}

export function skillColor(skill: string): string {
  return ({ en: "#4fd1c5", read: "#f0b429", type: "#68d391" } as Record<string, string>)[skill] ?? "#c8d0e0";
}

export function blend(a: string, b: string, t: number): string {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * k);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * k);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * k);
  return `rgb(${r},${g},${bl})`;
}

function hexRgb(c: string): [number, number, number] {
  if (c.startsWith("rgb")) {
    const m = c.match(/(\d+)/g);
    if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const h = c.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
