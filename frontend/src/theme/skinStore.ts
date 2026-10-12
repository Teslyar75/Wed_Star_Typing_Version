import { create } from "zustand";
import { applyTheme, type SkinTheme } from "./applyTheme";
import { setSkinSounds } from "../fx/sounds";
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
  setSkin: (id: string) => void;
};

function applySkin(skin: SkinTheme) {
  applyTheme(skin);
  setSkinSounds(skin.sounds || null);
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, skin.id);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.skin = skin.id;
    document.documentElement.dataset.bgEngine = skin.background?.engine || "living_space";
  }
}

const initial = byId(
  typeof localStorage !== "undefined" ? localStorage.getItem(KEY) || "spaceship" : "spaceship",
);

export const useSkin = create<SkinState>((set) => ({
  skin: initial,
  setSkin: (id) => {
    const skin = byId(id);
    applySkin(skin);
    set({ skin });
  },
}));

/** Вызвать один раз при старте App. */
export function bootSkin() {
  applySkin(useSkin.getState().skin);
}
