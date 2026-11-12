import { describe, expect, it } from "vitest";
import {
  PITCH_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampPitch,
  projectPoint,
  zoomToward,
} from "./labMath";

describe("lab camera math", () => {
  it("clamp pitch", () => {
    expect(clampPitch(10)).toBe(PITCH_MAX);
    expect(clampPitch(-10)).toBe(-PITCH_MAX);
  });

  it("zoomToward keeps point under cursor (orbit included)", () => {
    const cx = 400;
    const cy = 300;
    const R = 180;
    const world: [number, number, number] = [0.28, -0.17, 0.12];
    const pan = { panX: 0.08, panY: -0.04 };
    for (const [yaw, pitch] of [
      [0, 0],
      [0.85, 0.35],
      [-1.1, -0.55],
      [0.4, PITCH_MAX * 0.9],
    ] as const) {
      let zoom = 1;
      let vox = 0;
      let voy = 0;
      const [sx0, sy0] = projectPoint(...world, {
        yaw,
        pitch,
        zoom,
        ...pan,
        cx,
        cy,
        R,
        viewOx: vox,
        viewOy: voy,
      });
      for (const factor of [ZOOM_STEP, ZOOM_STEP, 1 / ZOOM_STEP, ZOOM_STEP ** 2, 1 / ZOOM_STEP]) {
        [zoom, vox, voy] = zoomToward(zoom, vox, voy, factor, [sx0, sy0], [cx, cy]);
        const [sx, sy] = projectPoint(...world, {
          yaw,
          pitch,
          zoom,
          ...pan,
          cx,
          cy,
          R,
          viewOx: vox,
          viewOy: voy,
        });
        expect(sx).toBeCloseTo(sx0, 9);
        expect(sy).toBeCloseTo(sy0, 9);
      }
      expect(zoom).not.toBe(1);
    }
    expect(ZOOM_MIN).toBeGreaterThanOrEqual(0.2);
    const [zMax] = zoomToward(ZOOM_MAX, 0, 0, ZOOM_STEP, [110, 110], [100, 100]);
    expect(zMax).toBe(ZOOM_MAX);
  });
});
