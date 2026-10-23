/** Обои отсека в alt — порт stamina/assets/alt_wallpapers/<profile>/<zone>.jpg (docs/ALT_UI.md «Отсеки и обои»).
 *  Профили есть у spaceship (starship) и steampunk; остальные скины — фолбэк на свой фон. */
const PROFILE: Record<string, string> = { spaceship: "starship", steampunk: "steampunk" };
const ZONE_FILE: Record<string, string> = {
  bridge: "bridge",
  english: "english",
  speed: "speedread",
  lounge: "lounge",
  radio: "radio",
  settings: "settings",
  orion: "orion",
};
/** Затемнение обоев (alt_wallpaper_dim десктопа). */
export const WALLPAPER_DIM = 0.35;

export function wallpaperUrl(skin: string, zone: string): string | null {
  const p = PROFILE[skin];
  const z = ZONE_FILE[zone];
  return p && z ? `/alt_wallpapers/${p}/${z}.jpg` : null;
}
