import { describe, expect, it } from "vitest";

function collide(head: { x: number; y: number }, body: { x: number; y: number }[]) {
  return body.some((p) => p.x === head.x && p.y === head.y);
}

/** Логика Esc как на десктопе: over → restart, иначе toggle pause. */
function escAction(over: boolean, paused: boolean): "restart" | "pause" | "resume" {
  if (over) return "restart";
  return paused ? "resume" : "pause";
}

describe("snake collide", () => {
  it("detects self hit", () => {
    expect(collide({ x: 1, y: 1 }, [{ x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(true);
    expect(collide({ x: 2, y: 1 }, [{ x: 1, y: 1 }])).toBe(false);
  });
});

describe("snake Esc", () => {
  it("restarts after game over", () => {
    expect(escAction(true, true)).toBe("restart");
  });
  it("toggles pause while alive", () => {
    expect(escAction(false, false)).toBe("pause");
    expect(escAction(false, true)).toBe("resume");
  });
});
