/** Эфир: чат РЕАЛЬНЫХ пилотов (не ИИ). UI как у Ориона/Документов, данные /api/comm. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { pageOf } from "../docs/docsApi";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import { createEpoch, isAbortError } from "../shell/requestEpoch";
import { observeBox } from "../shell/resizeGuard";
import { speakUtterance, stopSpeaking } from "../english/speak";
import {
  CopyBtn,
  MediaViewer,
  MdBody,
  SpeakBtn,
  fmtWhen,
  readImageFile,
  useDictation,
} from "../chat/crewChatUi";
import {
  CommHttpError,
  DEFAULT_COMM_LIMITS,
  commApi,
  emitCommUnread,
  exportCommBlob,
  filterComm,
  type CommExportFmt,
  type CommLimits,
  type CommMsg,
} from "./commApi";
import "../orion/orion.css";
import "./comm.css";

const ROW_H = 88;

export default function CommPanel() {
  const [items, setItems] = useState<CommMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [guest, setGuest] = useState(false);
  const [note, setNote] = useState("");
  const [linkOk, setLinkOk] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<number | null>(null);
  const [fit, setFit] = useState(4);
  const [query, setQuery] = useState("");
  const [ttsOn, setTtsOn] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [view, setView] = useState<{ img?: string; text?: string } | null>(null);
  const [limits, setLimits] = useState<CommLimits>(DEFAULT_COMM_LIMITS);
  const listBox = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const epoch = useRef(createEpoch());
  const ac = useRef<AbortController | null>(null);

  const dictation = useDictation({
    onText: setText,
    onStatus: setNote,
  });

  useEffect(() => {
    setZoneScreens("comm", [{ slug: "feed", label: t("comm") }]);
    setDeepRoute([{ slug: "feed", label: t("comm") }]);
    registerGoHandler(() => {});
    return () => registerGoHandler(null);
  }, []);

  useEffect(() => {
    if (!listBox.current) return;
    return observeBox(listBox.current, (box) => {
      setFit(Math.max(3, Math.floor(box.h / ROW_H)));
    });
  }, []);

  const load = useCallback(async () => {
    ac.current?.abort();
    const mine = epoch.current.next();
    const ctl = new AbortController();
    ac.current = ctl;
    setNote("");
    try {
      const r = await commApi.list(ctl.signal);
      if (!epoch.current.is(mine)) return;
      setGuest(false);
      setLinkOk(true);
      setItems(
        r.items.map((m) => ({
          ...m,
          images: Array.isArray(m.images) ? m.images : [],
        })),
      );
      if (r.limits) setLimits(r.limits);
      await commApi.markRead();
      if (!epoch.current.is(mine)) return;
      setUnread(0);
      emitCommUnread(0);
    } catch (e) {
      if (isAbortError(e) || !epoch.current.is(mine)) return;
      setLinkOk(false);
      if (e instanceof CommHttpError && e.status === 401) {
        setGuest(true);
        setItems([]);
        emitCommUnread(0);
        return;
      }
      setNote(e instanceof Error ? e.message : t("comm_err"));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      ac.current?.abort();
    };
  }, [load]);

  const lastSpoken = useRef(0);
  useEffect(() => {
    if (!ttsOn || !items.length) return;
    const last = items[items.length - 1];
    if (!last || last.mine || last.id === lastSpoken.current || !last.text.trim()) return;
    lastSpoken.current = last.id;
    stopSpeaking();
    speakUtterance({ text: last.text.slice(0, 1000) });
  }, [items, ttsOn]);

  const filtered = useMemo(() => filterComm(items, query), [items, query]);

  const send = async () => {
    const body = text.trim();
    if ((!body && !imgs.length) || busy || guest) return;
    setBusy(true);
    setNote("");
    try {
      const msg = await commApi.send(body, imgs);
      setItems((xs) => [...xs, { ...msg, images: msg.images || [] }]);
      setText("");
      setImgs([]);
      setPage(null);
      emitCommUnread(0);
      setLinkOk(true);
    } catch (e) {
      setLinkOk(false);
      setNote(e instanceof Error ? e.message : t("comm_err"));
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || guest) return;
    const add: string[] = [];
    const room = Math.max(0, limits.max_images - imgs.length);
    for (const f of Array.from(files).slice(0, room)) {
      if (f.size > limits.max_image_bytes) {
        setNote(t("comm_img_big"));
        continue;
      }
      if (!f.type.startsWith("image/")) continue;
      add.push(await readImageFile(f));
    }
    if (add.length) setImgs((x) => [...x, ...add].slice(0, limits.max_images));
  };

  const doExport = (fmt: CommExportFmt) => {
    const { blob, name } = exportCommBlob(filtered, fmt);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const total = Math.max(1, Math.ceil(filtered.length / fit));
  const pg = pageOf(filtered, page ?? total - 1, fit);

  return (
    <section className="orion-panel comm-panel" data-testid="comm-panel">
      <header className="comm-head">
        <h2>{t("comm_title")}</h2>
        <span className="muted" data-testid="comm-count">
          {t("comm_msgs")} {items.length} · {t("comm_new")} {unread}
        </span>
        <span
          className={`comm-link ${linkOk === false ? "err" : "ok"}`}
          data-testid="comm-link"
        >
          {guest ? t("comm_need_crew") : linkOk === false ? t("comm_link_off") : t("comm_link_on")}
        </span>
        <button type="button" className="hud-btn" data-testid="comm-refresh" onClick={() => void load()}>
          {t("comm_refresh")}
        </button>
      </header>

      {guest ? (
        <p className="orion-empty" data-testid="comm-status">
          {t("comm_need_crew")}
        </p>
      ) : (
        <>
          <div className="comm-tools">
            <input
              className="comm-search"
              data-testid="comm-search"
              value={query}
              placeholder={t("comm_search")}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <button
              type="button"
              className={"hud-btn" + (ttsOn ? " amber" : "")}
              data-testid="comm-tts"
              aria-pressed={ttsOn}
              onClick={() => setTtsOn((v) => !v)}
            >
              {ttsOn ? t("comm_tts_on") : t("comm_tts_off")}
            </button>
            <div className="comm-export-wrap">
              <button
                type="button"
                className="hud-btn"
                data-testid="comm-export"
                onClick={() => setExportOpen((v) => !v)}
              >
                {t("comm_export")}
              </button>
              {exportOpen ? (
                <div className="comm-export-menu" data-testid="comm-export-menu">
                  {(["txt", "md", "html"] as CommExportFmt[]).map((fmt) => (
                    <button key={fmt} type="button" data-testid={`comm-export-${fmt}`} onClick={() => doExport(fmt)}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="orion-list" ref={listBox} data-testid="comm-list">
            {filtered.length === 0 ? <div className="orion-empty">{t("comm_empty")}</div> : null}
            {pg.rows.map((m) => (
              <div
                key={m.id}
                className={`orion-msg ${m.mine ? "mine" : ""}`}
                data-testid="comm-msg"
                data-mine={m.mine ? "1" : "0"}
              >
                <div className="orion-msg-head">
                  <b className={`comm-call comm-acc-${m.accent}`}>
                    {m.callsign}
                    {m.mine ? " ▸" : ""}
                  </b>
                  <span className="comm-when">{fmtWhen(m.ts)}</span>
                  <span className="orion-msg-tools">
                    {(m.images || []).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="orion-thumb"
                        onClick={() => setView({ img: src })}
                      />
                    ))}
                    <CopyBtn text={m.text} />
                    <SpeakBtn text={m.text} />
                    <button type="button" className="hud-btn orion-mini" onClick={() => setView({ text: m.text })}>
                      {t("comm_open")}
                    </button>
                  </span>
                </div>
                <MdBody text={m.text} />
              </div>
            ))}
          </div>

          <div className="orion-pager" data-testid="comm-pager">
            <button type="button" className="hud-btn" disabled={pg.page <= 0} onClick={() => setPage(pg.page - 1)}>
              ‹
            </button>
            <span>
              {pg.page + 1}/{pg.pages}
            </span>
            <button
              type="button"
              className="hud-btn"
              disabled={pg.page >= pg.pages - 1}
              onClick={() => setPage(pg.page + 1)}
            >
              ›
            </button>
          </div>

          {note || dictation.listening ? (
            <div className="orion-note" data-testid="comm-status">
              {dictation.listening ? t("comm_listening") : note}
            </div>
          ) : null}

          <div className="orion-compose">
            <textarea
              data-testid="comm-input"
              rows={2}
              value={text}
              placeholder={t("comm_hint")}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={(e) => {
                const fl = e.clipboardData?.files;
                if (fl && fl.length) void onFiles(fl);
              }}
            />
            <div className="orion-compose-side">
              {imgs.map((src, i) => (
                <img key={i} src={src} alt="" className="orion-thumb" onClick={() => setView({ img: src })} />
              ))}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onFiles(e.target.files)}
              />
              <button
                type="button"
                className="hud-btn"
                data-testid="comm-attach"
                disabled={imgs.length >= limits.max_images}
                title={t("comm_attach")}
                onClick={() => fileRef.current?.click()}
              >
                📎
              </button>
              <button
                type="button"
                className={"hud-btn" + (dictation.listening ? " listening" : "")}
                data-testid="comm-voice"
                onClick={() => dictation.toggle()}
              >
                {dictation.listening ? t("comm_voice_stop") : t("comm_voice")}
              </button>
              <button
                type="button"
                className="hud-btn"
                data-testid="comm-hold"
                onPointerDown={() => dictation.start(true)}
                onPointerUp={() => dictation.stop()}
                onPointerCancel={() => dictation.stop()}
                onPointerLeave={() => dictation.stop()}
              >
                {t("comm_hold")}
              </button>
              <button
                type="button"
                className="hud-btn amber"
                data-testid="comm-send"
                disabled={busy || (!text.trim() && !imgs.length)}
                onClick={() => void send()}
              >
                {t("comm_send")}
              </button>
            </div>
          </div>
          <div className="orion-hint">{t("comm_hint")}</div>
        </>
      )}
      {view ? <MediaViewer {...view} onClose={() => setView(null)} /> : null}
    </section>
  );
}
