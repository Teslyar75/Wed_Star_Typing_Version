import { describe, expect, it } from "vitest";
import { LivingSpaceScene, profileCost } from "./livingSpace";

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

  it("light profile is cheaper than full", () => {
    const light = new LivingSpaceScene(800, 400, "light", 3);
    const full = new LivingSpaceScene(800, 400, "full", 3);
    expect(light.stars.length).toBeLessThan(full.stars.length);
    expect(light.rocks.length).toBeLessThan(full.rocks.length);
  });

  it("frost is cheapest cost", () => {
    expect(profileCost("frost")).toBeLessThan(profileCost("light"));
    expect(profileCost("light")).toBeLessThan(profileCost("full"));
    const frost = new LivingSpaceScene(400, 200, "frost", 4);
    expect(frost.comets.length).toBe(0);
    expect(frost.planets.length).toBe(0);
  });
});
