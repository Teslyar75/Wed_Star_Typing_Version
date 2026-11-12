/** Отсек «Орион»: Чат · Агенты · Архив — паритет десктопа stamina/orion_screen.py. */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerGoHandler, setDeepRoute, setZoneScreens } from "../shell/routeStore";
import {
  type Byo,
  type ChatMsg,
  type Hit,
  type ModeId,
  type OrionConfig,
  loadAgentKey,
  loadByo,
  orionApi,
  type CrewAgent,
} from "./orionApi";
import AgentsPage from "./AgentsPage";
import OrionLinkIndicator from "./OrionLinkIndicator";
import { ot } from "./orionI18n";
import { contextBlock, markSent } from "./marks";
import { useOrionLink } from "./useOrionLink";
import { useGuide } from "../guide/guideStore";
import {
  canOnlineAmbient,
  ONLINE_CHECK_MS,
  pickIdle,
  rememberAmbient,
  saveIdle,
} from "../guide/guideIdle";
import "./orion.css";

type Tab = "chat" | "agents" | "archive";
const TABS: Tab[] = ["chat", "agents", "archive"];
const TASK_TRIGGERS = ["запиши", "записать", "записывай", "на заметку", "запомни", "поставь задачу", "поставь задание", "todo"];

function accLab(a: string) {
  if (a === "commander") return ot("acc_commander");
  if (a === "observer") return ot("acc_observer");
  return ot("acc_crew");
}
function voiceLab(v: string) {
  if (v === "agent") return ot("voice_agent");
  if (v === "off") return ot("voice_off");
  return ot("voice_ship");
}

function speak(text: string, onEnd?: () => void) {
  try {
    const s = window.speechSynthesis;
    if (!s) { onEnd?.(); return; }
    s.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
    u.lang = "ru-RU";
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    s.speak(u);
  } catch { onEnd?.(); }
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn ghost orion-mini" onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); });
    }}>{ok ? ot("copied") : ot("copy")}</button>
  );
}

function Viewer({ img, text, onClose }: { img?: string; text?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="orion-viewer" data-testid="orion-viewer" onClick={onClose}>
      <div className="orion-viewer-box" onClick={(e) => e.stopPropagation()}>
        {img ? <img src={img} alt="" className="orion-viewer-img" /> : null}
        {text ? <div className="orion-viewer-text">{text}</div> : null}
        {text ? <CopyBtn text={text} /> : null}
        <button type="button" className="btn" onClick={onClose}>{ot("close")}</button>
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

function fmtWhen(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function quoteLine(h: Hit, you: string, orion: string) {
  const who = h.role === "user" ? you : orion;
  const body = (h.text || `${h.before}${h.match}${h.after}`).trim();
  return `${fmtWhen(h.at)} · ${who}: ${body}`;
}

type ChatProps = {
  cfg: OrionConfig;
  quotes: string[];
  onQuotesUsed: () => void;
  draft: string;
  setDraft: (s: string) => void;
  boardOn: boolean;
  setBoardOn: (v: boolean) => void;
  onConnect: () => void;
  onMsgs: (n: number) => void;
};

function ChatScreen({ cfg, quotes, onQuotesUsed, draft, setDraft, boardOn, setBoardOn, onConnect, onMsgs }: ChatProps) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [view, setView] = useState<{ img?: string; text?: string } | null>(null);
  const [crew, setCrew] = useState<CrewAgent | null>(null);
  const [items, setItems] = useState<CrewAgent[]>([]);
  const [pro, setPro] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [autoOn, setAutoOn] = useState(true);
  const [pendingTask, setPendingTask] = useState("");
  const [listening, setListening] = useState("");
  const [chatFail, setChatFail] = useState("");
  const [chatOkTick, setChatOkTick] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const autoRef = useRef<number>(0);
  const boardEnd = useRef<HTMLDivElement | null>(null);

  const mode = cfg.modes.find((m) => m.id === cfg.mode);
  const crewByo: Byo | null = crew ? {
    provider: crew.provider,
    base_url: crew.base_url,
    model: crew.model,
    vision: crew.vision,
    key: loadAgentKey(cfg.pilot, crew.agent_id),
  } : null;
  const byo = crewByo || (cfg.mode === "byo" ? loadByo(cfg.pilot) : null);
  const imagesOk = crew ? !!crew.vision : cfg.mode === "byo" ? !!byo?.vision : !!mode?.capabilities.images;

  const loadCrew = useCallback(() => {
    if (!cfg.logged_in) return;
    orionApi.agents().then((r) => {
      setItems(r.items);
      setCrew(r.items.find((x) => x.agent_id === r.active) || null);
    }).catch(() => {});
  }, [cfg.logged_in]);

  useEffect(loadCrew, [loadCrew, cfg.pilot]);
  useEffect(() => {
    if (!cfg.logged_in) return;
    orionApi.messages(0, 50).then((r) => { setMsgs(r.items); onMsgs(r.total); }).catch(() => {});
  }, [cfg.logged_in, onMsgs]);
  useEffect(() => { boardEnd.current?.scrollIntoView({ block: "end" }); }, [msgs, boardOn]);

  /* ONLINE ambient: редкая шутка/факт в чат, только когда агент свободен.
     Desktop guide_idle такого не делает (только toast) — web-дополнение с выключателем. */
  useEffect(() => {
    if (!cfg.logged_in) return;
    const onlineMode = cfg.mode === "byo" || cfg.mode === "hosted" || cfg.mode === "contributor" || !!crew;
    if (!onlineMode) return;
    const tick = () => {
      const g = useGuide.getState();
      if (!g.st.jokes || !g.idle.online_jokes) return;
      if (!canOnlineAmbient(g.idle, {
        now: Date.now(),
        lastTypeAt: g.lastTypeAt,
        jokesOn: g.st.jokes,
        onlineOn: g.idle.online_jokes,
        busy,
        hasDraft: !!draft.trim(),
        listening: !!listening,
        pendingAnswer: !!pendingTask,
      })) return;
      void (async () => {
        const idle = { ...g.idle, bags: { ...g.idle.bags } };
        const picked = await pickIdle(idle);
        if (!picked?.item) return;
        /* повторная проверка — за время загрузки мог начаться запрос */
        const g2 = useGuide.getState();
        if (busy || draft.trim() || listening || pendingTask) return;
        const saved = await rememberAmbient({ text: picked.item, kind: picked.kind, clipId: picked.itemId });
        if (!saved) return;
        idle.last_online_at = Date.now();
        saveIdle(g2.pilot, idle);
        g2.patchIdle({ last_online_at: idle.last_online_at, bags: idle.bags });
        setMsgs((m) => [...m, {
          id: saved.id,
          role: "orion",
          text: picked.item,
          kind: picked.kind,
          clip_id: picked.itemId,
          mode: "guide",
        }]);
        setBoardOn(true);
      })();
    };
    const iv = window.setInterval(tick, ONLINE_CHECK_MS);
    return () => window.clearInterval(iv);
  }, [cfg.logged_in, cfg.mode, crew, busy, draft, listening, pendingTask, setBoardOn]);

  const link = useOrionLink({
    cfg,
    agent: crew,
    busy,
    chatFailReason: chatFail,
    chatOkTick,
  });

  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const lastOrion = [...msgs].reverse().find((m) => m.role === "orion");
  const whoName = (crew?.name || ot("orion")).toUpperCase();

  const send = async (raw?: string) => {
    const q = (raw ?? draft).trim();
    if ((!q && !imgs.length) || busy) return;
    if (pendingTask) {
      const low = q.toLowerCase();
      if (["да", "ага", "yes", "ok"].some((w) => low.startsWith(w))) {
        await orionApi.plan(pendingTask, [{ title: pendingTask, weight: 1 }]);
        setPendingTask("");
        setDraft("");
        setNote(ot("task_saved"));
        setBoardOn(true);
        return;
      }
      if (["нет", "не", "no"].some((w) => low.startsWith(w))) {
        setPendingTask("");
        setDraft("");
        return;
      }
    }
    const hit = TASK_TRIGGERS.find((w) => q.toLowerCase().startsWith(w) || q.toLowerCase().includes(" " + w));
    if (hit && !pendingTask) {
      const task = q.replace(new RegExp("^.*" + hit, "i"), "").replace(/^[\s:,.—-]+/, "").trim() || q;
      setPendingTask(task);
      setDraft("");
      setNote(ot("ask_task", task.slice(0, 200)));
      return;
    }
    setBusy(true);
    setNote(ot("thinking"));
    const text = q || ot("attach");
    const mine: ChatMsg = { id: -Date.now(), role: "user", text, images: imgs };
    setMsgs((m) => [...m, mine]);
    setDraft("");
    const sent = imgs;
    setImgs([]);
    const usedQuotes = [...quotes];
    onQuotesUsed();
    try {
      const marks = contextBlock();
      const ctx = [`${ot("zone")} · ${whoName}`, marks].filter(Boolean).join("\n\n");
      const r = await orionApi.chat(text, sent, byo, crew?.agent_id || "", { quotes: usedQuotes, context: ctx });
      markSent();
      setMsgs((m) => [...m, { id: -Date.now() - 1, role: "orion", text: r.reply, mode: r.mode_used }]);
      if (r.fallback) {
        setNote(ot("fallback", r.reason || "error"));
        setChatFail(r.reason || "provider_error");
      } else {
        setNote("");
        setChatFail("");
        setChatOkTick((n) => n + 1);
      }
      if (ttsOn && (crew?.voice || "ship") !== "off") speak(r.reply);
      onMsgs(msgs.length + 2);
    } catch (e) {
      const msg = (e as Error).message;
      setChatFail(msg === "opencode_timeout" || msg === "http_502" ? "opencode_timeout" : msg);
      setNote(msg === "opencode_timeout" || msg === "http_502" ? ot("err_502") : ot("error", msg));
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    if (!imagesOk) return setNote(ot("no_images"));
    const add: string[] = [];
    for (const f of Array.from(files).slice(0, cfg.max_images - imgs.length)) {
      if (f.size > cfg.max_image_bytes) { setNote(ot("too_big")); continue; }
      add.push(await readImage(f));
    }
    setImgs((x) => [...x, ...add].slice(0, cfg.max_images));
  };

  const armedRef = useRef(false);
  const micGen = useRef(0);
  const startMic = (hold: boolean) => {
    const w = window as unknown as { webkitSpeechRecognition?: new () => Rec; SpeechRecognition?: new () => Rec };
    type Rec = {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
      onerror: ((ev: { error?: string }) => void) | null; onend: (() => void) | null;
      start: () => void; stop: () => void;
    };
    const Ctor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Ctor) { setNote(ot("mic_none")); return; }
    const gen = ++micGen.current;
    armedRef.current = true;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      if (micGen.current !== gen) return;
      let s = "";
      const res = ev.results;
      for (let i = 0; i < res.length; i++) s += res[i][0].transcript;
      setDraft(s);
      setListening(ot("listening"));
      if (autoOn && ev.results[ev.results.length - 1].isFinal && !hold) {
        window.clearTimeout(autoRef.current);
        autoRef.current = window.setTimeout(() => {
          if (micGen.current !== gen) return;
          stopMic();
          void send(s);
        }, 2500);
      }
    };
    rec.onerror = (ev) => {
      if (micGen.current !== gen) return;
      const err = ev?.error || "";
      if (err === "no-speech" || err === "aborted") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        armedRef.current = false;
        setListening("");
        setNote(ot("mic_denied"));
        return;
      }
      if (err === "network") setNote(ot("mic_net"));
    };
    rec.onend = () => {
      if (micGen.current !== gen || !armedRef.current) {
        if (micGen.current === gen) setListening("");
        return;
      }
      window.setTimeout(() => {
        if (micGen.current !== gen || !armedRef.current) return;
        try { rec.start(); } catch { /* InvalidStateError — уже слушает */ }
      }, 120);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(ot("listening"));
      setNote("");
    } catch (e) {
      armedRef.current = false;
      setListening("");
      setNote(ot("error", (e as Error).message || "mic"));
    }
  };
  const stopMic = () => {
    micGen.current += 1;
    armedRef.current = false;
    window.clearTimeout(autoRef.current);
    try { recRef.current?.stop(); } catch { /* */ }
    setListening("");
  };
  const toggleMic = () => { if (armedRef.current || listening) stopMic(); else startMic(false); };

  const cycle = async () => {
    if (items.length < 2) { onConnect(); return; }
    const ids = items.map((x) => x.agent_id);
    const i = ids.indexOf(crew?.agent_id || "");
    const next = ids[(i + 1) % ids.length];
    await orionApi.activateAgent(next);
    loadCrew();
  };

  const clearChat = async () => {
    if (!window.confirm(ot("clear_confirm"))) return;
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
    if (cfg.logged_in) await orionApi.clearMessages();
    setMsgs([]);
    onMsgs(0);
  };

  return (
    <div className="orion-screen orion-chat" data-testid="orion-chat">
      <div className="orion-who-bar">
        <span className="orion-who">{ot("who", whoName, accLab(crew?.access || "crew"), voiceLab(crew?.voice || "ship"))}</span>
        <OrionLinkIndicator view={link.view} onRecheck={link.recheck} testId="orion-link-chat" />
        <button type="button" className="hud-btn" onClick={() => setPro((v) => !v)}>{pro ? ot("mode_pro") : ot("mode_chat")}</button>
        <button type="button" className="hud-btn" onClick={() => setNote(ot("book_none"))}>{ot("read_book")}</button>
        <button type="button" className="hud-btn amber" onClick={() => void clearChat()}>{ot("clear")}</button>
        <button type="button" className={"hud-btn" + (boardOn ? " amber" : "")} onClick={() => setBoardOn(!boardOn)}>
          {boardOn ? ot("board_open") : ot("board_hidden")}
        </button>
        <button type="button" className={"hud-btn" + (autoOn ? " amber" : "")} onClick={() => setAutoOn((v) => !v)}>
          {autoOn ? ot("autosend_on") : ot("autosend_off")}
        </button>
        <button type="button" className={"hud-btn" + (ttsOn ? " amber" : "")} onClick={() => { setTtsOn((v) => !v); try { window.speechSynthesis?.cancel(); } catch { /* */ } }}>
          {ttsOn ? ot("tts_on") : ot("tts_off")}
        </button>
        <button type="button" className="hud-btn" onClick={onConnect}>{ot("connect")}</button>
        <button type="button" className="hud-btn" onClick={() => void cycle()}>{ot("cycle")}</button>
      </div>

      {boardOn ? (
        <section className="inst-panel orion-board">
          <h3>{ot("board_title")}</h3>
          <div className="orion-board-log" data-testid="orion-chat-list">
            {msgs.length === 0 ? <div className="orion-empty">{cfg.logged_in ? ot("empty_chat") : ot("login")}</div> : null}
            {msgs.map((m) => {
              const pics = Array.isArray(m.images) ? m.images : [];
              const kindLab = m.kind === "joke" ? ot("kind_joke") : m.kind === "fact" ? ot("kind_fact") : "";
              const who = m.role === "user" ? ot("you_pilot") : m.role === "system" ? ot("ship") : whoName;
              return (
                <div key={m.id} className={`orion-msg ${m.role}`} data-testid="orion-msg" data-kind={m.kind || ""}>
                  <div className="orion-msg-head">
                    <b>{kindLab ? `${kindLab} · ${who}` : who}</b>
                    {m.mode && m.role === "orion" && !m.kind ? <span className="orion-tag">{ot(`m_${m.mode}`)}</span> : null}
                    {m.kind ? <span className="orion-tag" data-testid={`orion-kind-${m.kind}`}>{m.kind}</span> : null}
                    <span className="orion-msg-tools">
                      {pics.map((p, i) => <img key={i} src={p} alt="" className="orion-thumb" onClick={() => setView({ img: p })} />)}
                      <CopyBtn text={m.text} />
                    </span>
                  </div>
                  <div className="orion-msg-text">{m.text}</div>
                </div>
              );
            })}
            <div ref={boardEnd} />
          </div>
        </section>
      ) : (
        <section className="inst-panel orion-live">
          <h3>{ot("live")}</h3>
          <p className="orion-live-pilot" data-testid="orion-msg">{ot("you_pilot")}: {lastUser?.text || "—"}</p>
          <div className="orion-live-orion" data-testid="orion-chat-list">
            {lastOrion ? (
              <div className="orion-msg orion" data-testid="orion-msg">
                <div className="orion-msg-head"><b>{whoName}</b><CopyBtn text={lastOrion.text} /></div>
                <div className="orion-msg-text">{lastOrion.text}</div>
              </div>
            ) : (
              <div className="orion-empty">{cfg.logged_in ? ot("empty_chat") : ot("login")}</div>
            )}
            
          </div>
        </section>
      )}

      {!boardOn ? <div className="orion-hint">{ot("board_hint")}</div> : null}
      <div className="orion-status">
        {crew ? <div>{ot("on_air", whoName)}</div> : null}
        <div className="free">{ot("orion_free")}</div>
      </div>
      {pendingTask ? (
        <div className="orion-ask">
          <span>{ot("ask_task", pendingTask)}</span>
          <button type="button" className="hud-btn amber" onClick={() => void send("да")}>{ot("yes_task")}</button>
          <button type="button" className="hud-btn" onClick={() => setPendingTask("")}>{ot("no_task")}</button>
        </div>
      ) : null}
      {note || listening ? <div className="orion-note" data-testid="orion-note">{listening || note}</div> : null}
      <div className="orion-compose">
        <textarea
          data-testid="orion-input"
          rows={pro ? 4 : 2}
          value={draft}
          placeholder={ot("placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (pro) {
              if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void send(); }
            } else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          onPaste={(e) => { const fl = e.clipboardData?.files; if (fl && fl.length) void onFiles(fl); }}
        />
        <div className="orion-compose-side">
          {imgs.map((p, i) => <img key={i} src={p} alt="" className="orion-thumb" onClick={() => setView({ img: p })} />)}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
          <button type="button" className="hud-btn" disabled={!imagesOk} title={imagesOk ? "" : ot("no_images")} onClick={() => fileRef.current?.click()}>📎</button>
          <button type="button" className={"hud-btn" + (listening ? " listening" : "")} data-testid="orion-voice" onClick={() => toggleMic()}>{listening ? ot("voice_stop") : ot("voice_btn")}</button>
          <button type="button" className="hud-btn" onPointerDown={() => startMic(true)} onPointerUp={stopMic} onPointerCancel={stopMic} onPointerLeave={stopMic}>{ot("hold")}</button>
          <button type="button" className="hud-btn amber" data-testid="orion-send" disabled={busy || (!draft.trim() && !imgs.length)} onClick={() => void send()}>
            {busy ? ot("stop") : ot("send_enter")}
          </button>
        </div>
      </div>
      <div className="orion-hint">{pro ? ot("hint_pro") : ot("hint_chat")}</div>
      {view ? <Viewer {...view} onClose={() => setView(null)} /> : null}
    </div>
  );
}

function ArchiveScreen({ cfg, onToChat, onToInput }: {
  cfg: OrionConfig;
  onToChat: (rows: Hit[]) => void;
  onToInput: (rows: Hit[]) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [view, setView] = useState<Hit | null>(null);

  const find = (query = q) => {
    if (!cfg.logged_in) return;
    orionApi.archive(query.trim()).then((r) => { setHits(r.items); setNote(ot("found_n", r.items.length)); }).catch(() => setHits([]));
  };
  useEffect(() => { if (cfg.logged_in) find(""); }, [cfg.logged_in]);

  const selected = () => (hits || []).filter((h) => picked.includes(h.id));
  const toggle = (id: number) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  return (
    <div className="orion-screen" data-testid="orion-archive">
      <div className="orion-archive-bar">
        <b>{ot("archive_title")}</b>
        <input value={q} placeholder={ot("search")} data-testid="orion-archive-q" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
        <span>{note}{picked.length ? " · " + ot("picked_n", picked.length) : ""}</span>
        <button type="button" className="hud-btn amber" disabled={!cfg.logged_in} onClick={() => find()} data-testid="orion-archive-find">{ot("find_cap")}</button>
        <button type="button" className="hud-btn" onClick={() => { setQ(""); setPicked([]); find(""); }}>{ot("reset")}</button>
      </div>
      <div className="orion-archive-acts">
        <button type="button" className="hud-btn" onClick={() => {
          const rows = selected();
          if (!rows.length) { setNote(ot("no_pick")); return; }
          onToChat(rows);
          setNote(ot("moved", rows.length));
        }}>{ot("to_chat")}</button>
        <button type="button" className="hud-btn" onClick={() => {
          const rows = selected();
          if (!rows.length) { setNote(ot("no_pick")); return; }
          onToInput(rows);
          setNote(ot("to_field"));
        }}>{ot("to_input")}</button>
        <button type="button" className="hud-btn" onClick={() => setPicked((hits || []).map((h) => h.id))}>{ot("pick_all")}</button>
        <button type="button" className="hud-btn" onClick={() => setPicked([])}>{ot("unpick")}</button>
      </div>
      <div className="orion-hint">{ot("archive_hint")}</div>
      <section className="inst-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h3>{ot("found")}</h3>
        <div className="orion-hits">
          {!cfg.logged_in ? <div className="orion-empty">{ot("login")}</div> : null}
          {hits && hits.length === 0 ? <div className="orion-empty">{ot("no_hits")}</div> : null}
          {(hits || []).map((h) => (
            <div key={h.id} className={"orion-hit" + (picked.includes(h.id) ? " on" : "")} data-testid="orion-hit">
              <input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggle(h.id)} aria-label={ot("pick_all")} />
              <button type="button" className="orion-hit-at" onClick={() => setView(h)}>{fmtWhen(h.at)} · {h.role === "user" ? ot("you_pilot") : ot("orion")}</button>
              <button type="button" className="orion-hit-text" onClick={() => setView(h)}>{h.before}<mark>{h.match}</mark>{h.after || (h.text || "").slice(0, 120)}</button>
            </div>
          ))}
        </div>
      </section>
      {view ? <Viewer text={view.text || `${view.before}${view.match}${view.after}`} onClose={() => setView(null)} /> : null}
    </div>
  );
}

export default function OrionPanel() {
  const [tab, setTab] = useState<Tab>("chat");
  const [cfg, setCfg] = useState<OrionConfig | null>(null);
  const [quotes, setQuotes] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [boardOn, setBoardOn] = useState(false);
  const [replicas, setReplicas] = useState(0);

  const reload = useCallback(() => {
    orionApi.config().then(setCfg).catch(() => setCfg({
      mode: "guide",
      modes: [{ id: "guide" as ModeId, available: true, reason: "", capabilities: { text: true, images: false } }],
      roles: [], logged_in: false, pilot: "", max_images: 3, max_image_bytes: 2_000_000,
    }));
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    const tick = () => { if (!document.hidden) reload(); };
    const id = window.setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  useEffect(() => {
    setZoneScreens("orion", TABS.map((s) => ({ slug: s, label: ot("tab_" + s) })));
    setDeepRoute([{ slug: tab, label: ot("tab_" + tab) }]);
  }, [tab]);
  useEffect(() => {
    registerGoHandler((slugs) => {
      const s = slugs[0] as Tab | "tasks" | "settings" | undefined;
      if (s === "tasks") { setTab("chat"); setBoardOn(true); return; }
      if (s === "settings") { setTab("agents"); return; }
      if (s && TABS.includes(s as Tab)) setTab(s as Tab);
    });
    return () => registerGoHandler(null);
  }, []);

  const toHits = (rows: Hit[], into: "chat" | "input") => {
    const lines = rows.map((h) => quoteLine(h, ot("you_pilot"), ot("orion")));
    if (into === "chat") {
      setQuotes(lines);
      setTab("chat");
      setBoardOn(true);
    } else {
      setDraft(lines.join("\n"));
      setTab("chat");
    }
  };

  return (
    <div className="orion-panel" data-testid="orion-panel" data-screen={tab}>
      <header className="orion-head">
        <h2 className="route-title">{ot("title")}</h2>
        <span className="orion-replicas">{ot("replicas", replicas)}</span>
        <nav className="orion-subtabs" aria-label={ot("title")}>
          {TABS.map((id) => (
            <button key={id} type="button" data-testid={"orion-tab-" + id} className={"hud-btn" + (tab === id ? " amber" : "")} onClick={() => setTab(id)}>
              {ot("tab_" + id)}
            </button>
          ))}
        </nav>
      </header>
      {!cfg ? null : tab === "chat" ? (
        <ChatScreen
          cfg={cfg}
          quotes={quotes}
          onQuotesUsed={() => setQuotes([])}
          draft={draft}
          setDraft={setDraft}
          boardOn={boardOn}
          setBoardOn={setBoardOn}
          onConnect={() => setTab("agents")}
          onMsgs={setReplicas}
        />
      ) : tab === "agents" ? (
        <AgentsPage cfg={cfg} replicaCount={replicas} onChange={reload} />
      ) : (
        <ArchiveScreen cfg={cfg} onToChat={(r) => toHits(r, "chat")} onToInput={(r) => toHits(r, "input")} />
      )}
    </div>
  );
}