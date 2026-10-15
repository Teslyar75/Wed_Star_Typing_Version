import { describe, expect, it } from "vitest";
import { applyTheme, clearSkinArtifacts, SKIN_FONTS_ID } from "./applyTheme";
import { clearSkinVoice, setSkinVoice, skinRank, voiceLookup } from "./voice";
import { skinSoundsFor } from "./skinStore";
import oldEngland from "../../../packages/themes/old_england.json";
import spaceship from "../../../packages/themes/spaceship.json";
import type { SkinTheme } from "./applyTheme";
import { bgEngineOf } from "../fx/SkinBackground";
import { missionTitle, setSkinVoice as setV } from "./voice";

const OE = oldEngland as unknown as SkinTheme;
const SS = spaceship as unknown as SkinTheme;

describe("skin world (S8 E1)", () => {
  it("applies shape kit + fonts and hard-resets them on switch", () => {
    const root = document.documentElement;
    applyTheme(OE);
    expect(root.dataset.shapePanel).toBe("booth");
    expect(root.dataset.shapeButton).toBe("enamel");
    expect(root.dataset.shapeCard).toBe("newspaper");
    expect(root.style.getPropertyValue("--st-shape-radius")).toContain("14px");
    expect(root.style.getPropertyValue("--st-paper")).toBe("#efe7d4");
    expect(document.getElementById(SKIN_FONTS_ID)?.textContent).toContain("Playfair Display SC");

    applyTheme(SS);
    expect(root.dataset.shapePanel).toBeUndefined();
    expect(root.dataset.shapeCard).toBeUndefined();
    expect(root.style.getPropertyValue("--st-shape-radius")).toBe("");
    expect(root.style.getPropertyValue("--st-paper")).toBe("");
    expect(document.getElementById(SKIN_FONTS_ID)).toBeNull();
    clearSkinArtifacts();
  });

  it("voice pack overlays with fallback and is cleared", () => {
    setSkinVoice(OE.voice, OE.ranks_i18n);
    expect(voiceLookup("bridge", "ru")).toBe("Флит-стрит");
    expect(voiceLookup("entry.takeoff", "en")).toBe("MIND THE GAP!");
    expect(voiceLookup("no_such_key", "ru")).toBeUndefined();
    expect(skinRank("Кадет", "ru")).toBe("Посыльный");
    expect(skinRank("Адмирал флота", "en")).toBe("Editor-in-chief of Fleet Street");
    expect(skinRank("Неизвестно", "ru")).toBe("Неизвестно");
    clearSkinVoice();
    expect(voiceLookup("bridge", "ru")).toBeUndefined();
    expect(skinRank("Кадет", "ru")).toBe("Кадет");
  });

  it("old_england vocabulary covers ru/uk/en/de and 8 ranks each", () => {
    for (const l of ["ru", "uk", "en", "de"]) {
      expect(OE.voice?.[l]?.bridge).toBeTruthy();
      expect(OE.voice?.[l]?.["entry.title"]).toBeTruthy();
      expect(OE.ranks_i18n?.[l]).toHaveLength(8);
    }
  });

  it("per-skin sounds only when sounds_ready, else starship fallback", () => {
    expect(skinSoundsFor(OE)?.click).toContain("old_england");
    expect(skinSoundsFor({ id: "steampunk", colors: {}, sounds: { click: "/x.wav" } })?.click).toContain("spaceship");
  });

  it("skin background replaces space; missions in-world", () => {
    expect(bgEngineOf(SS)).toBe("living_space");
    expect(bgEngineOf(OE)).toBe("london_fog");
    setV(OE.voice, OE.ranks_i18n);
    expect(missionTitle(1, "Стыковка", "ru")).toBe("Первая заметка");
    expect(missionTitle(1, "Docking", "en")).toBe("First column");
    clearSkinVoice();
    expect(missionTitle(1, "Стыковка", "ru")).toBe("Стыковка");
  });
});
