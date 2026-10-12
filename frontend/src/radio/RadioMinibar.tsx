import { t } from "../i18n";
import { useRadio } from "./radioStore";

type Props = { onOpen: () => void };

export default function RadioMinibar({ onOpen }: Props) {
  const { station, playing, toggle, volume, setVolume, nowPlaying } = useRadio();
  if (!station) return null;

  return (
    <div className="radio-minibar">
      <button type="button" className="hud-btn" onClick={onOpen} title={t("radio")}>
        📻 {nowPlaying ? `${station.name} — ${nowPlaying}` : station.name}
        {playing ? " ●" : ""}
      </button>
      <button type="button" className="hud-btn amber" onClick={() => toggle()}>
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        aria-label={t("radio_vol")}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}
