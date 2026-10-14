/** Радиорубка — раскладка как stamina/radio/screen.RadioScreen. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import {
  fetchCountries,
  fetchLanguages,
  fetchTags,
  searchStations,
  topStations,
  type CountryOpt,
  type Station,
} from "./api";
import { useRadio } from "./radioStore";
import { cacheStations, loadCachedStations } from "./stationCache";
import { registerGoHandler, setDeepRoute } from "../shell/routeStore";

type Tab = "air" | "rx";
/** Источник списка частот — отдельные вкладки вместо длинной прокрутки. */
type FreqMode = "top" | "favs" | "search";
type HudOpt = { value: string; label: string };

/** 12 вкладок × 10 волн = 120 станций. */
const FREQ_PAGE = 10;
const FREQ_TABS = 12;
const FREQ_TOTAL = FREQ_PAGE * FREQ_TABS;

/** Свой список вместо native &lt;select&gt; — portal в body, иначе clip/overflow режет меню. */
function HudSelect({
  value,
  onChange,
  options,
  emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: HudOpt[];
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value)?.label ?? emptyLabel;

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuBox(null);
      return;
    }
    const r = rootRef.current.getBoundingClientRect();
    setMenuBox({ left: r.left, top: r.bottom + 3, width: r.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const n = e.target as Node;
      if (rootRef.current?.contains(n) || menuRef.current?.contains(n)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onRe = () => {
      if (!rootRef.current) return;
      const r = rootRef.current.getBoundingClientRect();
      setMenuBox({ left: r.left, top: r.bottom + 3, width: r.width });
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onRe);
    window.addEventListener("scroll", onRe, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onRe);
      window.removeEventListener("scroll", onRe, true);
    };
  }, [open]);

  return (
    <div className={`hud-select${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="hud-btn hud-select-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hud-select-label">{current}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && menuBox
        ? createPortal(
            <ul
              className="hud-select-menu hud-select-menu-portal"
              role="listbox"
              ref={menuRef}
              style={{ left: menuBox.left, top: menuBox.top, width: menuBox.width }}
            >
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  className={!value ? "on" : ""}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </button>
              </li>
              {!options.length ? (
                <li className="muted hud-select-empty">{t("radio_filters_loading")}</li>
              ) : null}
              {options.map((o) => (
                <li key={o.value} role="option" aria-selected={value === o.value}>
                  <button
                    type="button"
                    className={value === o.value ? "on" : ""}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

function Antenna({ size = 44 }: { size?: number }) {
  return (
    <svg className="radio-antenna" width={size} height={size} viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r="14" fill="none" stroke="currentColor" strokeWidth="2" className="ant-ring" />
      <line x1="22" y1="12" x2="22" y2="34" stroke="var(--st-accent)" strokeWidth="2" />
      <line x1="22" y1="14" x2="32" y2="22" stroke="var(--st-accent)" strokeWidth="2" />
      <line x1="22" y1="14" x2="12" y2="22" stroke="var(--st-accent)" strokeWidth="2" />
    </svg>
  );
}

function stationSub(s: Station): string {
  return [s.country, (s.tags || "").slice(0, 40), s.bitrate ? `${s.bitrate} kbps` : ""]
    .filter(Boolean)
    .join(" · ");
}

export default function RadioPanel() {
  const [tab, setTab] = useState<Tab>("air");
  const [freqMode, setFreqMode] = useState<FreqMode>("top");
  const [freqPage, setFreqPage] = useState(0);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [lang, setLang] = useState("");
  const [countries, setCountries] = useState<CountryOpt[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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
    setVolume,
    toggleFav,
    isFav,
    nextFav,
    prevFav,
    setDuckOnType,
    setAutoLast,
  } = useRadio();

  useEffect(() => {
    const label = tab === "air" ? t("radio_air") : t("radio_rx");
    const segs: { slug: string; label: string }[] = [{ slug: tab, label }];
    if (tab === "air" && freqMode !== "top") {
      segs.push({
        slug: freqMode,
        label: freqMode === "favs" ? t("radio_favs") : t("radio_search_lab"),
      });
    }
    setDeepRoute(segs);
  }, [tab, freqMode]);

  useEffect(() => {
    registerGoHandler((slugs) => {
      const root = slugs[0] as Tab | undefined;
      if (root === "air" || root === "rx") setTab(root);
      const mode = slugs[1] as FreqMode | undefined;
      if (mode === "top" || mode === "favs" || mode === "search") setFreqMode(mode);
      else if (slugs.length === 1 && root === "air") setFreqMode("top");
    });
    return () => registerGoHandler(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "rx") return;
      const tagName = (e.target as HTMLElement)?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
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

  const applyList = useCallback((data: Station[], note: string) => {
    setStations(data);
    setStatus(note);
    setFreqPage(0);
  }, []);

  const loadMeta = useCallback(async () => {
    const [c, l, tg] = await Promise.all([fetchCountries(), fetchLanguages(), fetchTags()]);
    setCountries(c);
    setLangs(l);
    setTags(tg);
  }, []);

  const loadTop = useCallback(async () => {
    setBusy(true);
    setFreqMode("top");
    setStatus(t("radio_loading"));
    const cacheKey = `top:${FREQ_TOTAL}`;
    try {
      const data = await topStations(FREQ_TOTAL);
      applyList(data, t("radio_status_top"));
      void cacheStations(cacheKey, data);
    } catch {
      const cached = (await loadCachedStations(cacheKey)) as Station[] | null;
      if (cached?.length) applyList(cached, t("radio_cache"));
      else {
        setStations([]);
        setStatus(t("radio_err_net"));
      }
    } finally {
      setBusy(false);
    }
  }, [applyList]);

  useEffect(() => {
    void loadMeta();
    void loadTop();
  }, [loadMeta, loadTop]);

  const search = async () => {
    setBusy(true);
    setFreqMode("search");
    setStatus(t("radio_searching"));
    const cacheKey = `q:${q}|t:${tag}|c:${country}|l:${lang}`;
    try {
      const data = await searchStations({
        name: q || undefined,
        tag: tag || undefined,
        country: country || undefined,
        language: lang || undefined,
        limit: FREQ_TOTAL,
      });
      applyList(data, t("radio_found").replace("{0}", String(data.length)));
      void cacheStations(cacheKey, data);
      if (!data.length) setStatus(t("radio_empty"));
    } catch {
      const cached = (await loadCachedStations(cacheKey)) as Station[] | null;
      if (cached?.length) applyList(cached, t("radio_cache"));
      else {
        setStations([]);
        setStatus(t("radio_err_net"));
      }
    } finally {
      setBusy(false);
    }
  };

  const showFavs = () => {
    setFreqMode("favs");
    applyList(favs, t("radio_status_favs"));
  };

  const capped = stations.slice(0, FREQ_TOTAL);
  const freqPages =
    freqMode === "top"
      ? FREQ_TABS
      : Math.max(1, Math.min(FREQ_TABS, Math.ceil(capped.length / FREQ_PAGE) || 1));
  const pageSafe = Math.min(freqPage, freqPages - 1);
  const pageStations = capped.slice(pageSafe * FREQ_PAGE, pageSafe * FREQ_PAGE + FREQ_PAGE);

  const onPlay = (s: Station) => {
    try {
      play(s);
      setTab("rx");
    } catch {
      setStatus(t("radio_err_stream"));
    }
  };

  const playingUuid = station?.stationuuid || station?.url_resolved;

  return (
    <section className="radio">
      <header className="radio-head">
        <h2 className="route-title radio-title">{t("radio")}</h2>
        <div className="radio-tabs">
          <button type="button" className={`hud-btn ${tab === "air" ? "amber" : ""}`} onClick={() => setTab("air")}>
            {t("radio_air")}
          </button>
          <button type="button" className={`hud-btn ${tab === "rx" ? "amber" : ""}`} onClick={() => setTab("rx")}>
            {t("radio_rx")}
          </button>
        </div>
      </header>

      {tab === "air" && (
        <div className="radio-air">
          <aside className="inst-panel radio-filters">
            <div className="lab">{t("radio_filters")}</div>

            <label className="radio-field">
              <span className="lab">{t("radio_search_lab")}</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void search()}
                placeholder={t("radio_search")}
              />
            </label>

            <label className="radio-field">
              <span className="lab">{t("radio_country_lab")}</span>
              <HudSelect
                value={country}
                onChange={setCountry}
                emptyLabel={t("radio_all_countries")}
                options={countries.map((c) => ({
                  value: c.code,
                  label: `${c.name} (${c.code})`,
                }))}
              />
            </label>

            <label className="radio-field">
              <span className="lab">{t("radio_lang_lab")}</span>
              <HudSelect
                value={lang}
                onChange={setLang}
                emptyLabel={t("radio_all_langs")}
                options={langs.map((l) => ({ value: l, label: l }))}
              />
            </label>

            <label className="radio-field">
              <span className="lab">{t("radio_genre_lab")}</span>
              <HudSelect
                value={tag}
                onChange={setTag}
                emptyLabel={t("radio_all_tags")}
                options={tags.map((tg) => ({ value: tg, label: tg }))}
              />
            </label>

            <button type="button" className="hud-btn radio-act" disabled={busy} onClick={() => void search()}>
              🔍 {t("radio_find")}
            </button>
            <button type="button" className="hud-btn amber radio-act" onClick={showFavs}>
              ★ {t("radio_favs")}
            </button>
            <button type="button" className="hud-btn ok radio-act" disabled={busy} onClick={() => void loadTop()}>
              {t("radio_top")}
            </button>

            {status && <p className="muted radio-status">{status}</p>}
          </aside>

          <div className="radio-freqs">
            <div className="radio-freqs-head">
              <h3 className="radio-freqs-title">{t("radio_freqs")}</h3>
              <span className="muted">
                {t("radio_stations_n").replace("{0}", String(capped.length))}
              </span>
            </div>

            <div className="radio-freq-modes" role="tablist" aria-label={t("radio_freqs")}>
              <button
                type="button"
                role="tab"
                aria-selected={freqMode === "top"}
                className={`hud-btn ${freqMode === "top" ? "amber" : ""}`}
                disabled={busy}
                onClick={() => void loadTop()}
              >
                {t("radio_top")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={freqMode === "favs"}
                className={`hud-btn ${freqMode === "favs" ? "amber" : ""}`}
                onClick={showFavs}
              >
                ★ {t("radio_favs")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={freqMode === "search"}
                className={`hud-btn ${freqMode === "search" ? "amber" : ""}`}
                disabled={busy}
                onClick={() => void search()}
              >
                {t("radio_search_lab")}
              </button>
            </div>

            {freqPages > 1 ? (
              <div className="radio-freq-pages" role="tablist" aria-label={t("radio_freq_pages")}>
                {Array.from({ length: freqPages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={pageSafe === i}
                    className={`hud-btn radio-freq-page ${pageSafe === i ? "amber" : ""}`}
                    onClick={() => setFreqPage(i)}
                  >
                    {t("radio_freq_page").replace("{0}", String(i + 1))}
                  </button>
                ))}
              </div>
            ) : null}

            <ul className="radio-station-list">
              {!pageStations.length && <li className="muted radio-empty">{t("radio_empty")}</li>}
              {pageStations.map((s) => {
                const id = s.stationuuid || s.url_resolved;
                const active = id === playingUuid;
                return (
                  <li key={id + s.name} className={`radio-row${active ? " playing" : ""}`}>
                    <div className="radio-row-logo" aria-hidden>
                      <Antenna />
                    </div>
                    <div className="radio-row-info">
                      <div className="radio-row-name">{s.name.slice(0, 48)}</div>
                      <div className="muted radio-row-sub">{stationSub(s) || "—"}</div>
                    </div>
                    <button type="button" className="hud-btn ok radio-row-btn" onClick={() => onPlay(s)}>
                      ▶
                    </button>
                    <button
                      type="button"
                      className="hud-btn amber radio-row-btn"
                      title={t("radio_fav_toggle")}
                      onClick={() => toggleFav(s)}
                    >
                      {isFav(s) ? "★" : "☆"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab === "rx" && (
        <div className="inst-panel radio-receiver">
          <div className="lab">{t("radio_rx")}</div>
          {station ? (
            <>
              <div className="radio-rx-top">
                <div className="radio-rx-logo">
                  <Antenna size={100} />
                </div>
                <div className="radio-rx-meta">
                  <h3 className="radio-rx-name">{station.name.slice(0, 60)}</h3>
                  <p className="radio-rx-track">{nowPlaying || station.tags || t("radio_wait_meta")}</p>
                  <div className="radio-rx-live">
                    <span className={`radio-dot${playing ? " on" : ""}`}>●</span>
                    <span className={playing ? "warn" : "muted"}>{playing ? t("radio_in_air") : t("radio_silence")}</span>
                  </div>
                </div>
              </div>

              <div className="radio-rx-controls">
                <button type="button" className="hud-btn" onClick={() => prevFav()} disabled={!favs.length}>
                  ⏮
                </button>
                <button type="button" className="hud-btn ok" onClick={() => (playing ? pause() : resume())}>
                  {playing ? t("pause") : t("start")}
                </button>
                <button type="button" className="hud-btn danger" onClick={() => pause()}>
                  ⏹ {t("stop")}
                </button>
                <button type="button" className="hud-btn" onClick={() => nextFav()} disabled={!favs.length}>
                  ⏭
                </button>
              </div>

              <label className="radio-vol-row">
                <span className="lab">{t("radio_vol")}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </label>

              <label className="radio-opt muted">
                <input type="checkbox" checked={duckOnType} onChange={(e) => setDuckOnType(e.target.checked)} />{" "}
                {t("radio_duck_type")}
              </label>
              <label className="radio-opt muted">
                <input type="checkbox" checked={autoLast} onChange={(e) => setAutoLast(e.target.checked)} />{" "}
                {t("radio_auto_last")}
              </label>

              <div className="lab radio-hist-lab">{t("radio_history")}</div>
              <ul className="radio-history">
                {history.length === 0 && <li className="muted">—</li>}
                {history.map((tr, i) => (
                  <li key={`${tr}-${i}`}>{tr}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">{t("radio_rx_empty")}</p>
          )}
        </div>
      )}

    </section>
  );
}
