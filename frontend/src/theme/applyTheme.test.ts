import { describe, expect, it } from "vitest";
import { applyTheme, clearSkinArtifacts } from "./applyTheme";

describe("applyTheme hard reset", () => {
  it("wipes previous skin vars before applying the next", () => {
    const root = document.documentElement;
    applyTheme({
      id: "bathyscaphe",
      colors: { bg: "#021219", accent: "#ffcf4a", cyan: "#2ee6c5", text: "#bff7ee", purple: "#6bb8ff" },
    });
    expect(root.style.getPropertyValue("--st-purple")).toBe("#6bb8ff");
    expect(root.dataset.skin).toBe("bathyscaphe");

    applyTheme({
      id: "spaceship",
      colors: { bg: "#03060C", accent: "#FFB000", cyan: "#00E5FF", text: "#D6F4FF" },
    });
    expect(root.dataset.skin).toBe("spaceship");
    expect(root.style.getPropertyValue("--st-bg")).toBe("#03060C");
    expect(root.style.getPropertyValue("--st-accent")).toBe("#FFB000");
    // ключ, которого нет в новом скине — не должен остаться от прошлого
    expect(root.style.getPropertyValue("--st-purple")).toBe("");
  });

  it("clearSkinArtifacts removes all --st-* and dataset", () => {
    const root = document.documentElement;
    applyTheme({ id: "x", colors: { bg: "#111", accent: "#222", cyan: "#333" } });
    root.dataset.bgEngine = "sonar";
    clearSkinArtifacts(root);
    expect(root.style.getPropertyValue("--st-bg")).toBe("");
    expect(root.dataset.skin).toBeUndefined();
    expect(root.dataset.bgEngine).toBeUndefined();
  });
});
