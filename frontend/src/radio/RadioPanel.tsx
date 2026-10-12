import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { searchStations, type Station } from "./api";
import { useRadio } from "./radioStore";
import { cacheStations, loadCachedStations } from "./stationCache";

export default function RadioPanel() {
  const [q, setQ] = useState("ambient");
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [lang, setLang] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"air" | "favs" | "rx">("air");
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    station,
    playing,
    volume,
    favs,
    nowPlaying,
    history,
    duckOnType,
    autoLast,
    play,
    pause,
    resume,
    setAudio,
    setVolume,
    toggleFav,
    isFav,
    nextFav,
    prevFav,
    setDuckOnType,
    setAutoLast,
    tryAutoplayLast,
    syncFavsFromServer,
  } = useRadio();

  useEffect(() => {
    setAudio(audioRef.current);
    return () => setAudio(null);
  }, [setAudio]);

  useEffect(() => {
    const tmr = window.setTimeout(() => tryAutoplayLast(), 400);
    void syncFavsFromServer();
    return () => clearTimeout(tmr);
  }, [tryAutoplayLast, syncFavsFromServer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "rx") return;
      const tagName = (e.target as HTMLElement)?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        playing ? pause() : resume();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevFav();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextFav();
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, playing, pause, resume, prevFav, nextFav, setVolume, volume]);

  const search = async () => {
    setErr("");
    const cacheKey = `q:${q}|t:${tag}|c:${country}|l:${lang}`;
    try {
      const data = await searchStations({
        name: q || undefined,
        tag: tag || undefined,
        country: country || undefined,
        language: lang || undefined,
        limit: 12,
      });
      setStations(data);
      void cacheStations(cacheKey, data);
      if (!data.length) setErr(t("radio_empty"));
    } catch {
      const cached = (await loadCachedStations(cacheKey)) as Station[] | null;
      if (cached?.length) {
        setStations(cached);
        setErr(t("radio_cache"));
      } else setErr(t("radio_err_net"));
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
      setTab("rx");
    } catch {
      setErr(t("radio_err_stream"));
    }
  };

  const favDial = favs.length
    ? Math.max(
        0,
        favs.findIndex((x) => (x.stationuuid || x.url_resolved) === (station?.stationuuid || station?.url_resolved)),
      )
    : 0;

  return (
    <div className="radio">
      <div className="bridge-actions">
        <button type="button" className={`hud-btn ${tab === "air" ? "amber" : ""}`} onClick={() => setTab("air")}>
          {t("radio_air")}
        </button>
        <button type="button" className={`hud-btn ${tab === "favs" ? "amber" : ""}`} onClick={() => setTab("favs")}>
          {t("radio_favs")} ({favs.length})
        </button>
        <button type="button" className={`hud-btn ${tab === "rx" ? "amber" : ""}`} onClick={() => setTab("rx")}>
          {t("radio_rx")}
        </button>
      </div>

      <div className="bridge-actions">
        <label className="muted">
          <input type="checkbox" checked={duckOnType} onChange={(e) => setDuckOnType(e.target.checked)} />{" "}
          {t("radio_duck_type")}
        </label>
        <label className="muted">
          <input type="checkbox" checked={autoLast} onChange={(e) => setAutoLast(e.target.checked)} />{" "}
          {t("radio_auto_last")}
        </label>
      </div>

      {tab === "air" && (
        <div className="bridge-actions">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("radio_search")} />
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("radio_tag")} />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("radio_country")} />
          <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="lang" />
          <button type="button" className="hud-btn amber" onClick={() => void search()}>
            {t("radio_find")}
          </button>
        </div>
      )}

      {err && <p className="muted">{err}</p>}

      {(tab === "air" || tab === "favs") && (
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
      )}

      {tab === "rx" && (
        <div className="radio-receiver">
          {station ? (
            <>
              <p>
                <span className={`badge ${playing ? "ok" : ""}`}>{playing ? t("radio_on_air") : t("pause")}</span>{" "}
                <strong>{station.name}</strong>
              </p>
              {nowPlaying && (
                <p className="muted">
                  {t("radio_track")}: {nowPlaying}
                </p>
              )}
              {favs.length > 1 && (
                <div className="freq-dial">
                  <label className="muted">
                    {t("radio_dial")}{" "}
                    <input
                      type="range"
                      min={0}
                      max={favs.length - 1}
                      step={1}
                      value={favDial}
                      onChange={(e) => {
                        const s = favs[Number(e.target.value)];
                        if (s) onPlay(s);
                      }}
                    />
                  </label>
                  <span className="muted">
                    {favDial + 1}/{favs.length}
                  </span>
                </div>
              )}
              <div className="bridge-actions">
                <button type="button" className="hud-btn" onClick={() => prevFav()} disabled={!favs.length}>
                  ⏮
                </button>
                <button type="button" className="hud-btn amber" onClick={() => (playing ? pause() : resume())}>
                  {playing ? t("pause") : t("start")}
                </button>
                <button type="button" className="hud-btn" onClick={() => nextFav()} disabled={!favs.length}>
                  ⏭
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
            </>
          ) : (
            <p className="muted">{t("radio_rx_empty")}</p>
          )}
        </div>
      )}
      <audio ref={audioRef} className="radio-audio" crossOrigin="anonymous" />
    </div>
  );
}
