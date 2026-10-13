/** Оболочка игры — паритет stamina/lounge/base.py GameShell. */
import type { ReactNode } from "react";
import { t } from "../i18n";
import "./gameShell.css";

type Props = {
  title: string;
  hint: string;
  score: number;
  record: number;
  paused: boolean;
  over: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  onLobby: () => void;
  children: ReactNode;
};

export default function GameShell({
  title,
  hint,
  score,
  record,
  paused,
  over,
  onTogglePause,
  onRestart,
  onLobby,
  children,
}: Props) {
  // desktop base.py: "ДАЛЬШЕ" if paused else "ПАУЗА"
  const pauseLabel = paused && !over ? t("lounge_continue") : t("lounge_pause");

  return (
    <div className="game-shell" data-nav-lock>
      <header className="game-shell-top">
        <h2 className="game-shell-title">{title}</h2>
        <div className="game-shell-scores">
          <span className="game-shell-rec">
            {t("lounge_record_lbl")} {record}
          </span>
          <span className="game-shell-score">
            {t("lounge_score_lbl")} {score}
          </span>
        </div>
      </header>

      <div className="game-shell-bar">
        <div className="game-shell-btns" data-nav-group="game-shell-btns">
          <button type="button" className="hud-btn" onClick={onTogglePause} disabled={over}>
            {pauseLabel}
          </button>
          <button type="button" className="hud-btn amber" onClick={onRestart}>
            {t("lounge_again")}
          </button>
          <button type="button" className="hud-btn" onClick={onLobby}>
            {t("lounge_back_lobby")}
          </button>
        </div>
        <p className="muted game-shell-hint">{hint}</p>
      </div>

      <div className="game-shell-field inst-panel">
        <div className="lab game-shell-field-lab">{t("lounge_field")}</div>
        <div className="game-shell-stage">{children}</div>
      </div>
    </div>
  );
}
