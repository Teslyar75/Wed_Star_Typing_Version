/** Отсек «Орион»: Чат · Задачи · Архив · Настройки (экраны через ОБЗОР, постранично, без прокрутки).
 *  Один интерфейс для всех режимов (гид / свой агент / агент сервиса / участник разработки). */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import {
  type Byo,
  type ChatMsg,
  type Hit,
  type ModeId,
  type OrionConfig,
  type Proposal,
  type Task,
  colorFor,
  loadByo,
  maskKey,
  orionApi,
  pageOf,
  saveByo,
} from "./orionApi";
import { ot } from "./orionI18n";
import "./orion.css";

type Screen = "chat" | "tasks" | "archive" | "settings";
const SCREENS: Screen[] = ["chat", "tasks", "archive", "settings"];
const MODE_IDS: ModeId[] = ["guide", "byo", "hosted", "contributor"];

/** Сколько строк высотой rowH влезает в контейнер (пересчёт по ResizeObserver). */
function useFit(rowH: number, min = 1) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [n, setN] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => setN(Math.max(min, Math.floor(el.clientHeight / rowH)));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowH, min]);
  return [ref, n] as const;
}

function Pager({ page, pages, onPage, testid }: { page: number; pages: number; onPage: (p: number) => void; testid: string }) {
  return (
    <div className="orion-pager" data-testid={testid}>
      <button className="btn ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {ot("prev")}
      </button>
      <span>{ot("page", page + 1, pages)}</span>
      <button className="btn ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        {ot("next")}
      </button>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn ghost orion-mini"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? ot("copied") : ot("copy")}
    </button>
  );
}

/** Полноразмерный просмотр: картинка или весь текст сообщения (текст постранично). */
function Viewer({ img, text, onClose }: { img?: string; text?: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const chunks = text ? (text.match(/[\s\S]{1,1400}/g) ?? [""]) : [];
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="orion-viewer" data-testid="orion-viewer" onClick={onClose}>
      <div className="orion-viewer-box" onClick={(e) => e.stopPropagation()}>
        {img ? <img src={img} alt="" className="orion-viewer-img" /> : null}
        {text ? (
          <>
            <div className="orion-viewer-text">{chunks[page]}</div>
            {chunks.length > 1 ? <Pager page={page} pages={chunks.length} onPage={setPage} testid="orion-viewer-pager" /> : null}
            <CopyBtn text={text} />
          </>
        ) : null}
        <button className="btn" onClick={onClose}>
          {ot("close")}
        </button>
      </div>
    </div>
  );
}

function readImage(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/* ───────────── Чат ───────────── */
function ChatScreen({ cfg }: { cfg: OrionConfig }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [page, setPage] = useState<number | null>(null);
  const [view, setView] = useState<{ img?: string; text?: string } | null>(null);
  const [listRef, fit] = useFit(74);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const mode = cfg.modes.find((m) => m.id === cfg.mode);
  const byo = cfg.mode === "byo" ? loadByo(cfg.pilot) : null;
  const imagesOk = cfg.mode === "byo" ? !!byo?.vision : !!mode?.capabilities.images;

  useEffect(() => {
    if (!cfg.logged_in) return;
    orionApi
      .messages(0, 50)
      .then((r) => setMsgs(r.items))
      .catch(() => {});
  }, [cfg.logged_in]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setNote("");
    const mine: ChatMsg = { id: -Date.now(), role: "user", text: q, images: imgs };
    setMsgs((m) => [...m, mine]);
    setText("");
    const sent = imgs;
    setImgs([]);
    try {
      const r = await orionApi.chat(q, sent, byo);
      setMsgs((m) => [...m, { id: -Date.now() - 1, role: "orion", text: r.reply, mode: r.mode_used }]);
      if (r.fallback) setNote(ot("fallback", r.reason || "error"));
    } catch (e) {
      setNote(ot("error", (e as Error).message));
    } finally {
      setBusy(false);
      setPage(null);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    if (!imagesOk) return setNote(ot("no_images"));
    const add: string[] = [];
    for (const f of Array.from(files).slice(0, cfg.max_images - imgs.length)) {
      if (f.size > cfg.max_image_bytes) {
        setNote(ot("too_big"));
        continue;
      }
      add.push(await readImage(f));
    }
    setImgs((x) => [...x, ...add].slice(0, cfg.max_images));
  };

  const total = Math.max(1, Math.ceil(msgs.length / fit));
  const pg = pageOf(msgs, page ?? total - 1, fit);
  return (
    <div className="orion-screen orion-chat" data-testid="orion-chat">
      <div className="orion-list" ref={listRef} data-testid="orion-chat-list" data-fit={fit}>
        {msgs.length === 0 ? <div className="orion-empty">{cfg.logged_in ? ot("empty_chat") : ot("login")}</div> : null}
        {pg.rows.map((m) => {
          const pics = Array.isArray(m.images) ? m.images : [];
          return (
            <div key={m.id} className={`orion-msg ${m.role}`} data-testid="orion-msg">
              <div className="orion-msg-head">
                <b>{m.role === "user" ? ot("you") : ot("orion")}</b>
                {m.mode && m.role === "orion" ? <span className="orion-tag">{ot(`m_${m.mode}`)}</span> : null}
                <span className="orion-msg-tools">
                  {pics.map((p, i) => (
                    <img key={i} src={p} alt="" className="orion-thumb" onClick={() => setView({ img: p })} data-testid="orion-thumb" />
                  ))}
                  <CopyBtn text={m.text} />
                  <button className="btn ghost orion-mini" onClick={() => setView({ text: m.text })}>
                    {ot("open")}
                  </button>
                </span>
              </div>
              <div className="orion-msg-text">{m.text}</div>
            </div>
          );
        })}
      </div>
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} testid="orion-chat-pager" />
      {note ? <div className="orion-note" data-testid="orion-note">{note}</div> : null}
      <div className="orion-compose">
        <textarea
          data-testid="orion-input"
          rows={2}
          value={text}
          placeholder={ot("placeholder")}
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
          {imgs.map((p, i) => (
            <img key={i} src={p} alt="" className="orion-thumb" onClick={() => setView({ img: p })} />
          ))}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
          <button className="btn ghost" disabled={!imagesOk} title={imagesOk ? "" : ot("no_images")} onClick={() => fileRef.current?.click()}>
            {ot("attach")}
          </button>
          <button className="btn" data-testid="orion-send" disabled={busy || !text.trim()} onClick={() => void send()}>
            {ot("send")}
          </button>
        </div>
      </div>
      {view ? <Viewer {...view} onClose={() => setView(null)} /> : null}
    </div>
  );
}

/* ───────────── Задачи ───────────── */
function parseSteps(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(.*?)\*(\d+(?:\.\d+)?)$/);
      return m ? { title: m[1].trim(), weight: Number(m[2]) } : { title: x, weight: 1 };
    });
}

function TasksScreen({ cfg }: { cfg: OrionConfig }) {
  const [items, setItems] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [page, setPage] = useState(0);
  const [err, setErr] = useState("");
  const [ref, fit] = useFit(86);
  const load = useCallback(() => {
    if (!cfg.logged_in) return;
    orionApi
      .tasks()
      .then((r) => setItems(r.items))
      .catch((e: Error) => setErr(e.message));
  }, [cfg.logged_in]);
  useEffect(load, [load]);
  const upd = (t: Task) => setItems((xs) => xs.map((x) => (x.id === t.id ? t : x)));
  const pg = pageOf(items, page, fit);
  return (
    <div className="orion-screen" data-testid="orion-tasks">
      <div className="orion-row-form">
        <input value={title} placeholder={ot("task_title")} onChange={(e) => setTitle(e.target.value)} data-testid="orion-task-title" />
        <input value={steps} placeholder={ot("task_steps")} onChange={(e) => setSteps(e.target.value)} data-testid="orion-task-steps" />
        <button
          className="btn"
          disabled={!cfg.logged_in || !title.trim()}
          data-testid="orion-task-plan"
          onClick={() =>
            orionApi
              .plan(title.trim(), parseSteps(steps))
              .then(() => {
                setTitle("");
                setSteps("");
                load();
              })
              .catch((e: Error) => setErr(e.message))
          }
        >
          {ot("plan")}
        </button>
      </div>
      {err ? <div className="orion-note">{ot("error", err)}</div> : null}
      <div className="orion-list" ref={ref} data-fit={fit}>
        {items.length === 0 ? <div className="orion-empty">{cfg.logged_in ? ot("no_tasks") : ot("login")}</div> : null}
        {pg.rows.map((t) => (
          <div key={t.id} className="orion-task" data-testid="orion-task" data-state={t.state}>
            <div className="orion-task-head">
              <b>{t.title}</b>
              <span className="orion-tag">{ot(`st_${t.state}`)}</span>
              {t.stale ? <span className="orion-tag warn">{ot("stale")}</span> : null}
              <span className="orion-pct">{Math.round(t.percent)}%</span>
              {t.state === "planning" || t.state === "working" ? (
                <>
                  <button className="btn ghost orion-mini" onClick={() => orionApi.finish(t.id, "done").then(upd)}>
                    {ot("finish")}
                  </button>
                  <button className="btn ghost orion-mini" onClick={() => orionApi.finish(t.id, "stopped").then(upd)}>
                    {ot("stop")}
                  </button>
                </>
              ) : null}
            </div>
            <div className="orion-bar">
              <div className="orion-bar-fill" data-testid="orion-bar" style={{ width: `${t.percent}%`, background: colorFor(t.percent) }} />
            </div>
            <div className="orion-steps">
              {t.steps.map((s, i) => (
                <button
                  key={i}
                  className={`orion-step ${s.status}`}
                  onClick={() => orionApi.step(t.id, i, s.status === "done" ? "pending" : "done").then(upd)}
                >
                  {s.status === "done" ? "✓ " : ""}
                  {s.title}
                  {s.weight !== 1 ? ` ×${s.weight}` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} testid="orion-tasks-pager" />
    </div>
  );
}

/* ───────────── Архив ───────────── */
function ArchiveScreen({ cfg }: { cfg: OrionConfig }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [page, setPage] = useState(0);
  const [ref, fit] = useFit(64);
  const find = () => {
    if (!q.trim()) return;
    orionApi
      .archive(q.trim())
      .then((r) => {
        setHits(r.items);
        setPage(0);
      })
      .catch(() => setHits([]));
  };
  const pg = pageOf(hits ?? [], page, fit);
  return (
    <div className="orion-screen" data-testid="orion-archive">
      <div className="orion-row-form">
        <input
          value={q}
          placeholder={ot("search")}
          data-testid="orion-archive-q"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && find()}
        />
        <button className="btn" disabled={!cfg.logged_in} onClick={find} data-testid="orion-archive-find">
          {ot("find")}
        </button>
      </div>
      <div className="orion-list" ref={ref} data-fit={fit}>
        {!cfg.logged_in ? <div className="orion-empty">{ot("login")}</div> : null}
        {hits && hits.length === 0 ? <div className="orion-empty">{ot("no_hits")}</div> : null}
        {pg.rows.map((h) => (
          <div key={h.id} className="orion-hit" data-testid="orion-hit">
            <span className="orion-tag">{h.role === "user" ? ot("you") : ot("orion")}</span>
            <span className="orion-hit-at">{h.at ? new Date(h.at).toLocaleString() : ""}</span>
            <div className="orion-hit-text">
              {h.before}
              <mark>{h.match}</mark>
              {h.after}
            </div>
          </div>
        ))}
      </div>
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} testid="orion-archive-pager" />
    </div>
  );
}

/* ───────────── Настройки ───────────── */
function ByoForm({ pilot }: { pilot: string }) {
  const saved = loadByo(pilot);
  const [b, setB] = useState<Byo>(saved ?? { provider: "openai", base_url: "", model: "", vision: false, key: "" });
  const [key, setKey] = useState("");
  const [has, setHas] = useState(saved?.key ?? "");
  return (
    <div className="orion-byo" data-testid="orion-byo">
      <b>{ot("byo_title")}</b>
      <div className="orion-byo-grid">
        <label>
          {ot("byo_provider")}
          <select value={b.provider} onChange={(e) => setB({ ...b, provider: e.target.value as Byo["provider"] })}>
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label>
          {ot("byo_url")}
          <input value={b.base_url} onChange={(e) => setB({ ...b, base_url: e.target.value })} data-testid="orion-byo-url" />
        </label>
        <label>
          {ot("byo_model")}
          <input value={b.model} onChange={(e) => setB({ ...b, model: e.target.value })} data-testid="orion-byo-model" />
        </label>
        <label>
          {ot("byo_key")}
          <input
            type="password"
            autoComplete="off"
            value={key}
            placeholder={has ? maskKey(has) : ""}
            onChange={(e) => setKey(e.target.value)}
            data-testid="orion-byo-key"
          />
        </label>
      </div>
      <label className="orion-check">
        <input type="checkbox" checked={b.vision} onChange={(e) => setB({ ...b, vision: e.target.checked })} />
        {ot("byo_vision")}
      </label>
      <div className="orion-row-form">
        <button
          className="btn"
          data-testid="orion-byo-save"
          onClick={() => {
            const next = { ...b, key: key || has };
            saveByo(pilot, next);
            setHas(next.key);
            setKey("");
          }}
        >
          {ot("byo_save")}
        </button>
        {has ? (
          <>
            <span data-testid="orion-byo-masked">{ot("byo_saved", maskKey(has))}</span>
            <button
              className="btn ghost"
              data-testid="orion-byo-remove"
              onClick={() => {
                saveByo(pilot, { ...b, key: "" });
                setHas("");
              }}
            >
              {ot("byo_remove")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Proposals() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    orionApi
      .proposals()
      .then((r) => setItems(r.items))
      .catch(() => {});
  }, []);
  return (
    <div className="orion-byo" data-testid="orion-proposals">
      <b>{ot("proposals")}</b>
      <div className="orion-row-form">
        <input value={title} placeholder={ot("prop_title")} onChange={(e) => setTitle(e.target.value)} />
        <input value={desc} placeholder={ot("prop_desc")} onChange={(e) => setDesc(e.target.value)} />
        <button
          className="btn"
          disabled={!title.trim()}
          onClick={() =>
            orionApi
              .propose(title.trim(), desc)
              .then((p) => {
                setItems((x) => [p, ...x]);
                setTitle("");
                setDesc("");
              })
              .catch((e: Error) => setErr(e.message))
          }
        >
          {ot("propose")}
        </button>
      </div>
      <div className="orion-note">{err ? ot("error", err) : ot("prop_note")}</div>
      {items.slice(0, 3).map((p) => (
        <div key={p.id} className="orion-hit">
          <span className="orion-tag">{p.status}</span> <code>{p.branch}</code> {p.title}
        </div>
      ))}
    </div>
  );
}

function SettingsScreen({ cfg, onMode }: { cfg: OrionConfig; onMode: (m: ModeId) => void }) {
  const [err, setErr] = useState("");
  return (
    <div className="orion-screen" data-testid="orion-settings">
      <b>{ot("mode")}</b>
      <div className="orion-modes">
        {MODE_IDS.map((id) => {
          const m = cfg.modes.find((x) => x.id === id);
          const on = cfg.mode === id;
          const locked = !m?.available;
          return (
            <div key={id} className={`orion-mode ${on ? "on" : ""} ${locked ? "locked" : ""}`} data-testid={`orion-mode-${id}`} data-locked={locked ? "1" : "0"}>
              <div className="orion-mode-head">
                <b>
                  {locked ? "🔒 " : ""}
                  {ot(`m_${id}`)}
                </b>
                {on ? (
                  <span className="orion-tag">{ot("active")}</span>
                ) : (
                  <button
                    className="btn ghost orion-mini"
                    disabled={locked}
                    data-testid={`orion-choose-${id}`}
                    onClick={() =>
                      orionApi
                        .setMode(id)
                        .then(() => onMode(id))
                        .catch((e: Error) => setErr(e.message))
                    }
                  >
                    {ot("choose")}
                  </button>
                )}
              </div>
              <div className="orion-mode-desc">{ot(`m_${id}_d`)}</div>
              {locked && m?.reason ? <div className="orion-mode-lock" data-testid={`orion-lock-${id}`}>{ot(`r_${m.reason}`)}</div> : null}
            </div>
          );
        })}
      </div>
      {err ? <div className="orion-note">{ot("error", err)}</div> : null}
      {cfg.mode === "byo" ? <ByoForm pilot={cfg.pilot} /> : null}
      {cfg.mode === "contributor" ? <Proposals /> : null}
    </div>
  );
}

/* ───────────── Панель ───────────── */
export default function OrionPanel() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [cfg, setCfg] = useState<OrionConfig | null>(null);
  const reload = useCallback(() => {
    orionApi
      .config()
      .then(setCfg)
      .catch(() =>
        setCfg({
          mode: "guide",
          modes: [{ id: "guide", available: true, reason: "", capabilities: { text: true, images: false } }],
          roles: [],
          logged_in: false,
          pilot: "",
          max_images: 3,
          max_image_bytes: 2_000_000,
        }),
      );
  }, []);
  useEffect(reload, [reload]);

  useEffect(() => {
    setZoneScreens(
      "orion",
      SCREENS.map((s) => ({ slug: s, label: ot(s) })),
    );
    setDeepRoute([{ slug: screen, label: ot(screen) }]);
  }, [screen]);
  useEffect(() => {
    registerGoHandler((slugs) => {
      const s = slugs[0] as Screen | undefined;
      if (s && SCREENS.includes(s)) setScreen(s);
    });
    return () => registerGoHandler(null);
  }, []);

  return (
    <div className="orion-panel" data-testid="orion-panel" data-screen={screen}>
      {!cfg ? null : screen === "chat" ? (
        <ChatScreen cfg={cfg} />
      ) : screen === "tasks" ? (
        <TasksScreen cfg={cfg} />
      ) : screen === "archive" ? (
        <ArchiveScreen cfg={cfg} />
      ) : (
        <SettingsScreen cfg={cfg} onMode={(m) => (setCfg({ ...cfg, mode: m }), reload())} />
      )}
    </div>
  );
}
