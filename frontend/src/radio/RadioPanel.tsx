import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { searchStations, type Station } from "./api";
import { useRadio } from "./radioStore";

export default function RadioPanel() {
  const [q, setQ] = useState("ambient");
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"air" | "favs">("air");
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    station,
    playing,
    volume,
    favs,
    nowPlaying,
    history,
    play,
    pause,
    resume,
    setAudio,
    setVolume,
    toggleFav,
    isFav,
  } = useRadio();

  useEffect(() => {
    setAudio(audioRef.current);
    return () => setAudio(null);
  }, [setAudio]);

  const search = async () => {
    setErr("");
    try {
      const data = await searchStations({
        name: q || undefined,
        tag: tag || undefined,
        country: country || undefined,
        limit: 12,
      });
      setStations(data);
      if (!data.length) setErr(t("radio_empty"));
    } catch {
      setErr(t("radio_err_net"));
    }
  };

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = tab === "favs" ? favs : stations;

  const onPlay = (s: Station) => {
    try {
      play(s);
    } catch {
      setErr(t("radio_err_stream"));
    }
  };

  return (
    <div className="radio">
      <div className="bridge-actions">
        <button type="button" className={`hud-btn ${tab === "air" ? "amber" : ""}`} onClick={() => setTab("air")}>
          {t("radio_air")}
        </button>
        <button type="button" className={`hud-btn ${tab === "favs" ? "amber" : ""}`} onClick={() => setTab("favs")}>
          {t("radio_favs")} ({favs.length})
        </button>
      </div>
      {tab === "air" && (
        <div className="bridge-actions">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("radio_search")} />
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("radio_tag")} />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("radio_country")} />
          <button type="button" className="hud-btn amber" onClick={() => void search()}>
            {t("radio_find")}
          </button>
        </div>
      )}
      {err && <p className="muted">{err}</p>}
      <ul className="station-list">
        {list.map((s) => (
          <li key={(s.stationuuid || s.url_resolved) + s.name}>
            <button type="button" className="hud-btn" onClick={() => onPlay(s)}>
              {s.name}
              {s.country ? ` · ${s.country}` : ""}
              {s.bitrate ? ` · ${s.bitrate}k` : ""}
            </button>
            <button type="button" className="hud-btn" title={t("radio_fav_toggle")} onClick={() => toggleFav(s)}>
              {isFav(s) ? "★" : "☆"}
            </button>
          </li>
        ))}
      </ul>
      {station && (
        <div className="radio-receiver">
          <p>
            <span className={`badge ${playing ? "ok" : ""}`}>{playing ? t("radio_on_air") : t("pause")}</span>{" "}
            <strong>{station.name}</strong>
          </p>
          {nowPlaying && (
            <p className="muted">
              {t("radio_track")}: {nowPlaying}
            </p>
          )}
          <div className="bridge-actions">
            <button type="button" className="hud-btn amber" onClick={() => (playing ? pause() : resume())}>
              {playing ? t("pause") : t("start")}
            </button>
            <label>
              {t("radio_vol")}{" "}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
          </div>
          {history.length > 0 && (
            <>
              <h4>{t("radio_history")}</h4>
              <ul className="station-list">
                {history.map((tr, i) => (
                  <li key={`${tr}-${i}`}>{tr}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <audio ref={audioRef} className="radio-audio" crossOrigin="anonymous" />
    </div>
  );
}
