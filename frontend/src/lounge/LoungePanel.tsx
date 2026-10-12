import { useState } from "react";
import { t } from "../i18n";
import SnakeGame from "./SnakeGame";

export default function LoungePanel() {
  const [best, setBest] = useState(() => Number(localStorage.getItem("st_snake_best") || "0"));
  const [msg, setMsg] = useState("");

  const onScore = async (score: number) => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("st_snake_best", String(score));
    }
    if (score >= 50) {
      try {
        await fetch("/api/sessions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "lounge",
            lang: "en",
            chars: score,
            typed: score,
            errors: 0,
            elapsed: 1,
            cpm: 0,
            acc: 100,
            rhythm: 0,
            best_streak: score,
          }),
        });
        setMsg(`${t("lounge_xp")} (+${Math.max(1, Math.floor(score / 20))} XP)`);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <section className="lounge">
      <h2>{t("lounge")}</h2>
      <p className="muted">{t("lounge_blurb")}</p>
      <p className="muted">
        {t("best")}: {best}
      </p>
      {msg && <p className="muted">{msg}</p>}
      <h3>{t("snake")}</h3>
      <SnakeGame onScore={onScore} />
    </section>
  );
}
