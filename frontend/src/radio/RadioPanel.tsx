import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Station = { name: string; url_resolved: string; favicon?: string; country?: string };

export default function RadioPanel() {
  const [q, setQ] = useState("ambient");
  const [stations, setStations] = useState<Station[]>([]);
  const [current, setCurrent] = useState<Station | null>(null);
  const [err, setErr] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const search = async () => {
    setErr("");
    try {
      const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=8&hidebroken=true`;
      const data = (await (await fetch(url)).json()) as Station[];
      setStations(data.filter((s) => s.url_resolved));
    } catch {
      setErr(t("radio_err_net"));
    }
  };

  const play = (s: Station) => {
    setCurrent(s);
    const a = audioRef.current;
    if (!a) return;
    a.src = s.url_resolved;
    void a.play().catch(() => setErr(t("radio_err_stream")));
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.name,
        artist: "Star Typing Radio",
        album: s.country || "Uplink",
        artwork: s.favicon ? [{ src: s.favicon, sizes: "96x96", type: "image/png" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => void a.play());
      navigator.mediaSession.setActionHandler("pause", () => a.pause());
      navigator.mediaSession.setActionHandler("stop", () => {
        a.pause();
        a.removeAttribute("src");
      });
    }
  };

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="radio">
      <div className="bridge-actions">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("radio_search")} />
        <button type="button" className="hud-btn amber" onClick={() => void search()}>
          {t("radio_find")}
        </button>
      </div>
      {err && <p className="muted">{err}</p>}
      <ul className="station-list">
        {stations.map((s) => (
          <li key={s.url_resolved + s.name}>
            <button type="button" className="hud-btn" onClick={() => play(s)}>
              {s.name}
            </button>
          </li>
        ))}
      </ul>
      <audio ref={audioRef} controls className="radio-audio" />
      {current && (
        <p className="muted">
          {t("radio_on_air")}: {current.name}
        </p>
      )}
    </div>
  );
}
