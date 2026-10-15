/** Гид G3: события — новое звание, личный рекорд, серия ошибок. Окна ждут паузы в наборе (очередь стора). */
import { useEffect } from "react";
import { t } from "../i18n";
import { useSkin } from "../theme/skinStore";
import { skinRank } from "../theme/voice";
import { checkRecord, ERROR_STREAK, isRankUp } from "./guideLogic";
import { useGuide } from "./guideStore";

export type SessionDetail = { cpm: number; acc: number; chars: number };
export const SESSION_EVENT = "st-session";

const skin = () => useSkin.getState().skin.id;

export async function onSession(seg: SessionDetail, fetchMe: () => Promise<{ rank?: string } | null>) {
  const g = useGuide.getState();
  if (!g.pilot || g.st.id === "none") return;
  const rec = checkRecord(g.st.bests, seg);
  g.patch({ bests: rec.bests });
  if (rec.kind) {
    g.fire("record", {
      linesKey: `record:${rec.kind}`,
      skin: skin(),
      vars: { cpm: Math.round(seg.cpm), acc: seg.acc, prev: Math.round(rec.prev) },
    });
  }
  const me = await fetchMe().catch(() => null);
  const rank = me?.rank;
  const st = useGuide.getState().st;
  if (rank && isRankUp(st.last_rank, rank)) {
    useGuide.getState().fire("rank_up", { skin: skin(), vars: { rank: skinRank(rank, "ru") } });
  }
  if (rank) useGuide.getState().patch({ last_rank: rank });
}

export default function GuideEvents() {
  useEffect(() => {
    let errs = 0;
    const onType = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; want?: string | null }>).detail;
      if (!d) return;
      if (d.ok) {
        errs = 0;
        return;
      }
      errs += 1;
      if (errs === ERROR_STREAK) {
        const key = d.want === " " ? "пробел" : (d.want || "?").toUpperCase();
        useGuide.getState().fire("error_streak", { skin: skin(), vars: { key } });
      }
    };
    const onSess = (e: Event) => {
      const d = (e as CustomEvent<SessionDetail>).detail;
      if (d)
        void onSession(d, async () => {
          // звание текущего пилота (в /me его нет, roster ограничен 40 карточками)
          const r = await fetch("/api/sessions/summary", { credentials: "include" });
          return r.ok ? ((await r.json()) as { rank?: string }) : null;
        });
    };
    window.addEventListener("st-type", onType);
    window.addEventListener(SESSION_EVENT, onSess);
    return () => {
      window.removeEventListener("st-type", onType);
      window.removeEventListener(SESSION_EVENT, onSess);
    };
  }, []);
  return null;
}

/** Имя зоны «Мостик» в словаре скина (для реплик). */
export function bridgeName(): string {
  return t("bridge");
}
