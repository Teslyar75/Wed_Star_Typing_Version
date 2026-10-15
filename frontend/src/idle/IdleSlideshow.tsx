/**
 * Простой (S8 E2): через N минут без клавиатуры — полноэкранное слайдшоу в стиле скина
 * + радио по жанрам скина с плавным входом до ~30 %. Первое нажатие закрывает и НЕ уходит в набор.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSkin } from "../theme/skinStore";
import { useRadio } from "../radio/radioStore";
import { searchStations } from "../radio/api";
import { useIdle } from "./idleStore";
import { ti } from "./idleI18n";
import { fadeVolume, isIdle, pickStation } from "./idleLogic";
import "./idle.css";

type Img = {
  provider: string;
  url: string;
  author?: string;
  author_url?: string;
  license?: string;
  source?: string;
  source_url?: string;
  title?: string;
  download_location?: string;
};

type SkinExtra = { radio?: { tags?: string[]; country?: string; pinned?: string[] } };

const SLIDE_MS = 12_000;
const FADE_MS = 6_000;
const RADIO_TARGET = 0.3;

export const IDLE_OPEN_EVENT = "st-idle-open";

export default function IdleSlideshow() {
  const skin = useSkin((s) => s.skin);
  const { minutes, radio, after, provider } = useIdle();
  const [open, setOpen] = useState(false);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [idx, setIdx] = useState(0);
  const last = useRef(Date.now());
  const startedRadio = useRef(false);
  const fadeTimer = useRef(0);

  const stopFade = () => {
    if (fadeTimer.current) window.clearInterval(fadeTimer.current);
    fadeTimer.current = 0;
  };

  const startRadio = useCallback(async () => {
    const conf = (skin as unknown as SkinExtra).radio;
    if (!radio || !conf?.tags?.length) return;
    const r = useRadio.getState();
    if (r.playing) return; // уже играет — не трогаем
    for (const tag of conf.tags) {
      try {
        const list = await searchStations({ tag, country: conf.country, limit: 30 });
        const st = pickStation(list, conf.pinned);
        if (!st) continue;
        const target = Math.min(RADIO_TARGET, r.volume);
        r.play(st);
        startedRadio.current = true;
        const t0 = performance.now();
        stopFade();
        fadeTimer.current = window.setInterval(() => {
          const a = useRadio.getState().audio;
          const el = performance.now() - t0;
          if (a) a.volume = fadeVolume(el, FADE_MS, target);
          if (el >= FADE_MS) stopFade();
        }, 150);
        return;
      } catch {
        /* следующий тег */
      }
    }
  }, [skin, radio]);

  const openShow = useCallback(async () => {
    setOpen(true);
    setIdx(0);
    const fallback: Img[] = [
      { provider: "skin", url: `/skins/${skin.id}/bg1.jpg`, source: "Star Typing", title: skin.id },
    ];
    try {
      const r = await fetch(`/api/slideshow/images?skin=${encodeURIComponent(skin.id)}&provider=${provider}`);
      const j = r.ok ? await r.json() : null;
      setImgs(j?.items?.length ? j.items : fallback);
    } catch {
      setImgs(fallback);
    }
    void startRadio();
  }, [skin.id, provider, startRadio]);

  const close = useCallback(() => {
    setOpen(false);
    last.current = Date.now();
    stopFade();
    if (startedRadio.current) {
      const r = useRadio.getState();
      if (after === "stop") r.stop();
      else if (r.audio) r.audio.volume = r.volume;
      startedRadio.current = false;
    }
  }, [after]);

  // активность: клавиатура (и клик), таймер простоя
  useEffect(() => {
    const touch = () => {
      last.current = Date.now();
    };
    window.addEventListener("keydown", touch, true);
    window.addEventListener("pointerdown", touch, true);
    const id = window.setInterval(() => {
      if (!open && isIdle(last.current, Date.now(), minutes) && document.visibilityState === "visible") {
        void openShow();
      }
    }, 5000);
    const manual = () => void openShow();
    window.addEventListener(IDLE_OPEN_EVENT, manual);
    return () => {
      window.removeEventListener("keydown", touch, true);
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener(IDLE_OPEN_EVENT, manual);
      window.clearInterval(id);
    };
  }, [open, minutes, openShow]);

  // первое нажатие закрывает и не уходит в набор (capture на window — раньше всех)
  useEffect(() => {
    if (!open) return;
    let swallowed = "";
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowed = e.code || e.key;
      close();
    };
    window.addEventListener("keydown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      // keypress/keyup той же клавиши тоже глотаем
      const eat = (e: KeyboardEvent) => {
        if ((e.code || e.key) === swallowed) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (e.type === "keyup") {
          window.removeEventListener("keypress", eat, true);
          window.removeEventListener("keyup", eat, true);
        }
      };
      if (swallowed) {
        window.addEventListener("keypress", eat, true);
        window.addEventListener("keyup", eat, true);
      }
    };
  }, [open, close]);

  // смена слайдов
  useEffect(() => {
    if (!open || imgs.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % imgs.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [open, imgs.length]);

  // Unsplash: отметить показ (правило API), через сервер
  useEffect(() => {
    const cur = imgs[idx];
    if (open && cur?.provider === "unsplash" && cur.download_location) {
      void fetch(`/api/slideshow/unsplash/track?download_location=${encodeURIComponent(cur.download_location)}`, {
        method: "POST",
      }).catch(() => {});
    }
  }, [open, idx, imgs]);

  if (!open) return null;
  const cur = imgs[idx];
  const name = typeof skin.name === "string" ? skin.name : skin.name?.ru || skin.id;
  return createPortal(
    <div className="idle-show" role="dialog" aria-modal="true" aria-label={ti("title")} onClick={close} data-skin-show={skin.id}>
      {imgs.map((im, i) => (
        <div
          key={im.url + i}
          className={`idle-slide ${i === idx ? "on" : ""}`}
          style={{ backgroundImage: i === idx || i === (idx + 1) % imgs.length ? `url("${im.url}")` : undefined }}
        />
      ))}
      <div className="idle-vignette" />
      <div className="idle-top">
        <span className="idle-skin">{name}</span>
        <span className="idle-hint">{ti("hint")}</span>
      </div>
      {cur && (
        <div className="idle-credit">
          {cur.provider === "unsplash" ? (
            <>
              {ti("photo")}{" "}
              <a href={cur.author_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {cur.author}
              </a>{" "}
              on{" "}
              <a href={cur.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                Unsplash
              </a>
            </>
          ) : (
            <>
              {cur.title ? <span className="idle-title">{cur.title.replace(/\.(jpe?g|png)$/i, "")}</span> : null}
              {cur.author ? <> · {cur.author}</> : null}
              {cur.license ? <> · {cur.license}</> : null}
              {cur.source ? (
                <>
                  {" · "}
                  <a href={cur.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {cur.source}
                  </a>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
