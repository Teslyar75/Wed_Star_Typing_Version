/**
 * Фон кабины по скину. Скин ПОЛНОСТЬЮ заменяет космос Звездолёта:
 * living_space → SpaceCanvas; свой компонент из реестра; иначе фото+FX (SkinBackdrop).
 */
import type { ComponentType } from "react";
import SpaceCanvas from "./SpaceCanvas";
import SkinBackdrop from "./SkinBackdrop";
import LondonFog from "./bg/LondonFog";
import type { SkinTheme } from "../theme/applyTheme";
import type { SpaceProfile } from "./livingSpace";

/** Реестр DOM/CSS-фонов: новый скин = новая запись (Чёрная Америка, Гангстеры, Козырьки…). */
export const BG_REGISTRY: Record<string, ComponentType> = {
  london_fog: LondonFog,
};

export function bgEngineOf(skin: Pick<SkinTheme, "background">): string {
  return skin.background?.engine || "living_space";
}

export default function SkinBackground({ skin, profile }: { skin: SkinTheme; profile: SpaceProfile }) {
  const engine = bgEngineOf(skin);
  if (engine === "living_space") {
    return <SpaceCanvas profile={profile} fullBleed className="space-canvas full" />;
  }
  const Custom = BG_REGISTRY[engine];
  if (Custom) return <Custom />;
  return <SkinBackdrop themeId={skin.id} engine={engine} profile={profile} className="space-canvas full" />;
}
