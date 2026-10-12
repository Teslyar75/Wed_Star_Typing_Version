import { describe, expect, it } from "vitest";
import { SkinBackdropScene } from "./skinScene";

describe("SkinBackdropScene", () => {
  it("steps without throwing for skin engines", () => {
    const scene = new SkinBackdropScene(200, 120, "bathyscaphe", "sonar");
    scene.step(0.016);
    expect(scene.particles.length).toBeGreaterThan(0);
    scene.setTheme("steampunk", "gears");
    scene.step(0.016);
    expect(scene.engine).toBe("gears");
  });
});
