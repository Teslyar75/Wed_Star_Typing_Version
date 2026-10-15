import { create } from "zustand";
import { applyTheme, clearSkinArtifacts, type SkinTheme } from "./applyTheme";
import { clearSkinAudio, setSkinSounds } from "../fx/sounds";
import spaceship from "../../../packages/themes/spaceship.json";
import bathyscaphe from "../../../packages/themes/bathyscaphe.json";
import steampunk from "../../../packages/themes/steampunk.json";
import scriptorium from "../../../packages/themes/scriptorium.json";
import neonCity from "../../../packages/themes/neon_city.json";
import zenGarden from "../../../packages/themes/zen_garden.json";
import oldEngland from "../../../packages/themes/old_england.json";
import { clearSkinVoice, setSkinVoice } from "./voice";
import { i18n } from "../i18n/setup";

export const ALL_SKINS = [spaceship, bathyscaphe, steampunk, scriptorium, neonCity, zenGarden, oldEngland] as unknown as SkinTheme[];

const KEY = "st_skin";

function byId(id: string): SkinTheme {
  return ALL_SKINS.find((s) => s.id === id) || (spaceship as SkinTheme);
}

type SkinState = {
  skin: SkinTheme;
  /** Счётчик смены — remount фона/оболочки без артефактов. */
  gen: number;
  setSkin: (id: string) => void;
  /** Живой предпросмотр (экран входа): применить без сохранения. */
  previewSkin: (id: string) => void;
};

/**
 * Единая точка смены скина: полный сброс артефактов → чистая тема → звуки → persist.
 */
function switchSkinHard(skin: SkinTheme, persist = true) {
  clearSkinArtifacts();
  clearSkinAudio();
  clearSkinVoice();
  applyTheme(skin);
  setSkinVoice(skin.voice, skin.ranks_i18n);
  // свой банк звуков — только если скин объявил полный набор; иначе FX Звездолёта
  setSkinSounds(skinSoundsFor(skin));
  // перерисовать подписи (t()/te() читают voice pack)
  try {
    i18n.emit("languageChanged", i18n.language);
  } catch {
    /* ignore */
  }
  if (!persist) return;
  try {
    localStorage.setItem(KEY, skin.id);
  } catch {
    /* ignore */
  }
}

export function skinSoundsFor(skin: SkinTheme) {
  if (skin.id === "spaceship" || skin.sounds_ready) return skin.sounds || null;
  return (spaceship as SkinTheme).sounds || null;
}

export const useSkin = create<SkinState>((set) => ({
  skin: spaceship as SkinTheme,
  gen: 0,
  setSkin: (id) => {
    const skin = byId(id);
    switchSkinHard(skin);
    set((s) => ({ skin, gen: s.gen + 1 }));
  },
  previewSkin: (id) => {
    const skin = byId(id);
    switchSkinHard(skin, false);
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
