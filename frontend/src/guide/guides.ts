/** Каталог гидов (G1: доступен только ОРИОН, остальные — «скоро»). */
import shipAi from "../../../packages/guides/ship_ai.json";
import shipAiRu from "../../../packages/guides/lines/ship_ai.ru.json";
import type { LinesFile } from "./guideLogic";

export type GuideProfile = {
  id: string;
  name: string;
  title: string;
  voice: string;
  rate: number;
  portrait: string;
  soon?: boolean;
};

export const GUIDES: GuideProfile[] = [
  {
    id: shipAi.id,
    name: shipAi.name.ru,
    title: shipAi.title.ru,
    voice: shipAi.voice.ru,
    rate: shipAi.rate,
    portrait: shipAi.portrait,
  },
  { id: "narrator", name: "Мистер Хоббс", title: "рассказчик", voice: "ru-RU-DmitryNeural", rate: 1, portrait: "❦", soon: true },
  { id: "teacher", name: "Вера Павловна", title: "учитель", voice: "ru-RU-SvetlanaNeural", rate: 1, portrait: "✎", soon: true },
  { id: "cadet", name: "Кадет Тим", title: "напарник", voice: "ru-RU-DmitryNeural", rate: 1.05, portrait: "✦", soon: true },
];

export const NO_GUIDE = "none";

/** Порядок выбора стрелками: доступные гиды + «Без гида». */
export const PICKABLE: string[] = [...GUIDES.filter((g) => !g.soon).map((g) => g.id), NO_GUIDE];

const LINES: Record<string, LinesFile> = { ship_ai: shipAiRu as LinesFile };

export function guideById(id: string): GuideProfile | undefined {
  return GUIDES.find((g) => g.id === id);
}

export function linesOf(id: string): LinesFile | undefined {
  return LINES[id];
}

export function cycleGuide(cur: string, d: 1 | -1): string {
  const i = PICKABLE.indexOf(cur);
  return PICKABLE[(Math.max(0, i) + d + PICKABLE.length) % PICKABLE.length]!;
}
