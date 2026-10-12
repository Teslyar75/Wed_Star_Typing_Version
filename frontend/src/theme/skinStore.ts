import { create } from "zustand";
import { applyTheme, clearSkinArtifacts, type SkinTheme } from "./applyTheme";
import { clearSkinAudio, setSkinSounds } from "../fx/sounds";
import spaceship from "../../../packages/themes/spaceship.json";
import bathyscaphe from "../../../packages/themes/bathyscaphe.json";
import steampunk from "../../../packages/themes/steampunk.json";
import scriptorium from "../../../packages/themes/scriptorium.json";
import neonCity from "../../../packages/themes/neon_city.json";
import zenGarden from "../../../packages/themes/zen_garden.json";

export const ALL_SKINS = [spaceship, bathyscaphe, steampunk, scriptorium, neonCity, zenGarden] as SkinTheme[];

const KEY = "st_skin";

function byId(id: string): SkinTheme {
  return ALL_SKINS.find((s) => s.id === id) || (spaceship as SkinTheme);
}

type SkinState = {
  skin: SkinTheme;
  /** Счётчик смены — remount фона/оболочки без артефактов. */
  gen: number;
  setSkin: (id: string) => void;
};

/**
 * Единая точка смены скина: полный сброс артефактов → чистая тема → звуки → persist.
 */
function switchSkinHard(skin: SkinTheme) {
  clearSkinArtifacts();
  clearSkinAudio();
  applyTheme(skin);
  // пока альтернативные скины сырые — FX-банк как у Звездолёта (без чужих сэмплов)
  const sounds =
    skin.id === "spaceship" ? skin.sounds || null : (spaceship as SkinTheme).sounds || null;
  setSkinSounds(sounds);
  try {
    localStorage.setItem(KEY, skin.id);
  } catch {
    /* ignore */
  }
}

export const useSkin = create<SkinState>((set) => ({
  skin: spaceship as SkinTheme,
  gen: 0,
  setSkin: (id) => {
    const skin = byId(id);
    switchSkinHard(skin);
    set((s) => ({ skin, gen: s.gen + 1 }));
  },
}));

/** Старт кабины. preferBase=true — всегда «Звездолёт». */
export function bootSkin(opts?: { preferBase?: boolean }) {
  const id = opts?.preferBase ? "spaceship" : useSkin.getState().skin.id;
  try {
    if (opts?.preferBase) localStorage.setItem(KEY, "spaceship");
  } catch {
    /* ignore */
  }
  useSkin.getState().setSkin(id);
}
