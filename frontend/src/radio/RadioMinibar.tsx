/** Компактная полоса приёмника в шапке — как stamina/radio/minibark.RadioMiniBar. */
import { t } from "../i18n";
import { useRadio } from "./radioStore";

type Props = { onOpen: () => void };

function shortName(name: string, max = 16): string {
  const n = name.trim();
  if (n.length <= max) return n;
  return `${n.slice(0, max - 1)}…`;
}

export default function RadioMinibar({ onOpen }: Props) {
  const { station, playing, toggle, volume, setVolume, stop } = useRadio();
  if (!station) return null;

  const volPct = Math.round(volume * 100);

  return (
    <div className="radio-minibar" title={station.name}>
      <button type="button" className="hud-btn radio-mini-name" onClick={onOpen}>
        {shortName(station.name)}
        <span className="radio-mini-vol"> · {volPct}</span>
      </button>
      <button type="button" className="hud-btn amber radio-mini-btn" onClick={() => toggle()} title={playing ? t("pause") : t("start")}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        className="hud-btn radio-mini-btn"
        onClick={() => setVolume(Math.max(0, volume - 0.08))}
        title={t("radio_vol")}
      >
        −
      </button>
      <button
        type="button"
        className="hud-btn radio-mini-btn"
        onClick={() => setVolume(Math.min(1, volume + 0.08))}
        title={t("radio_vol")}
      >
        +
      </button>
      <button type="button" className="hud-btn danger radio-mini-btn" onClick={() => stop()} title={t("stop")}>
        ✕
      </button>
    </div>
  );
}
