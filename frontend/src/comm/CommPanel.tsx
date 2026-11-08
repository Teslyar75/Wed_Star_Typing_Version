/** Эфир: общий чат пилотов. UI чата как у Ориона (лента/pager/compose), данные отдельные. */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { pageOf } from "../docs/docsApi";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import { createEpoch, isAbortError } from "../shell/requestEpoch";
import { observeBox } from "../shell/resizeGuard";
import { CommHttpError, commApi, emitCommUnread, type CommMsg } from "./commApi";
import "../orion/orion.css";
import "./comm.css";

const ROW_H = 72;

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost orion-mini"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? t("comm_copied") : t("comm_copy")}
    </button>
  );
}

function Viewer({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="orion-viewer" data-testid="comm-viewer" onClick={onClose}>
      <div className="orion-viewer-box" onClick={(e) => e.stopPropagation()}>
        <div className="orion-viewer-text">{text}</div>
        <CopyBtn text={text} />
        <button type="button" className="btn" onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}

export default function CommPanel() {
  const [items, setItems] = useState<CommMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [guest, setGuest] = useState(false);
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<number | null>(null);
  const [fit, setFit] = useState(4);
  const [view, setView] = useState<string | null>(null);
  const listBox = useRef<HTMLDivElement | null>(null);
  const epoch = useRef(createEpoch());
  const ac = useRef<AbortController | null>(null);

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
      setItems(r.items);
      await commApi.markRead();
      if (!epoch.current.is(mine)) return;
      setUnread(0);
      emitCommUnread(0);
    } catch (e) {
      if (isAbortError(e) || !epoch.current.is(mine)) return;
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

  const send = async () => {
    const body = text.trim();
    if (!body || busy || guest) return;
    setBusy(true);
    setNote("");
    try {
      const msg = await commApi.send(body);
      setItems((xs) => [...xs, msg]);
      setText("");
      setPage(null);
      emitCommUnread(0);
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("comm_err"));
    } finally {
      setBusy(false);
    }
  };

  const total = Math.max(1, Math.ceil(items.length / fit));
  const pg = pageOf(items, page ?? total - 1, fit);

  return (
    <section className="orion-panel comm-panel" data-testid="comm-panel">
      <header className="comm-head">
        <h2>{t("comm_title")}</h2>
        <span className="muted" data-testid="comm-count">
          {t("comm_msgs")} {items.length} · {t("comm_new")} {unread}
        </span>
        <button type="button" className="btn ghost" data-testid="comm-refresh" onClick={() => void load()}>
          {t("comm_refresh")}
        </button>
      </header>
      {guest ? (
        <p className="orion-empty" data-testid="comm-status">
          {t("comm_need_crew")}
        </p>
      ) : (
        <>
          <div className="orion-list" ref={listBox} data-testid="comm-list">
            {items.length === 0 ? <div className="orion-empty">{t("comm_empty")}</div> : null}
            {pg.rows.map((m) => (
              <div key={m.id} className={`orion-msg ${m.mine ? "mine" : ""}`} data-testid="comm-msg" data-mine={m.mine ? "1" : "0"}>
                <div className="orion-msg-head">
                  <b className={`comm-call comm-acc-${m.accent}`}>{m.mine ? "▸ " : ""}{m.callsign}</b>
                  <span className="orion-msg-tools">
                    <CopyBtn text={m.text} />
                    <button type="button" className="btn ghost orion-mini" onClick={() => setView(m.text)}>
                      {t("comm_open")}
                    </button>
                  </span>
                </div>
                <div className="orion-msg-text">{m.text}</div>
              </div>
            ))}
          </div>
          <div className="orion-pager" data-testid="comm-pager">
            <button type="button" className="btn ghost" disabled={pg.page <= 0} onClick={() => setPage(pg.page - 1)}>
              ‹
            </button>
            <span>
              {pg.page + 1}/{pg.pages}
            </span>
            <button type="button" className="btn ghost" disabled={pg.page >= pg.pages - 1} onClick={() => setPage(pg.page + 1)}>
              ›
            </button>
          </div>
          {note ? (
            <div className="orion-note" data-testid="comm-status">
              {note}
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
            />
            <div className="orion-compose-side">
              <button type="button" className="btn" data-testid="comm-send" disabled={busy || !text.trim()} onClick={() => void send()}>
                {t("comm_send")}
              </button>
            </div>
          </div>
        </>
      )}
      {view ? <Viewer text={view} onClose={() => setView(null)} /> : null}
    </section>
  );
}
