import { describe, expect, it } from "vitest";
import { wallpaperUrl } from "./altWallpaper";

describe("wallpaperUrl", () => {
  it("maps skin profile and zone", () => {
    expect(wallpaperUrl("spaceship", "speed")).toBe("/alt_wallpapers/starship/speedread.jpg");
    expect(wallpaperUrl("steampunk", "radio")).toBe("/alt_wallpapers/steampunk/radio.jpg");
  });
  it("generic skins fall back", () => {
    expect(wallpaperUrl("zen_garden", "bridge")).toBeNull();
  });
});
