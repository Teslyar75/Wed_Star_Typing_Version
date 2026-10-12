import { describe, expect, it } from "vitest";
import { LivingSpaceScene } from "./livingSpace";

describe("LivingSpaceScene", () => {
  it("seeds stars/comets/rocks", () => {
    const s = new LivingSpaceScene(800, 400, "light", 1);
    expect(s.stars.length).toBe(90);
    expect(s.comets.length).toBe(1);
    expect(s.rocks.length).toBe(3);
  });

  it("moves stars left on step", () => {
    const s = new LivingSpaceScene(400, 200, "light", 2);
    const x0 = s.stars[0]!.x;
    s.step(0.5, 1);
    expect(s.stars[0]!.x).toBeLessThan(x0);
  });
});
