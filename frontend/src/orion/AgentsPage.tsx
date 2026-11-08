import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAgentKey, maskKey, orionApi, saveAgentKey, type CrewAgent, type OrionConfig } from "./orionApi";
import { ot } from "./orionI18n";

const KINDS = ["openai_compat", "opencode", "github_bridge"] as const;
const PRESETS: Record<string, { base_url: string; model: string; provider: "openai" | "anthropic" }> = {
  openai: { base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", provider: "openai" },
  deepseek: { base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", provider: "openai" },
  groq: { base_url: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", provider: "openai" },
  ollama: { base_url: "http://localhost:11434/v1", model: "llama3.1", provider: "openai" },
};
const EVO = ["", "Знакомство", "Привыкание", "Характер", "Свой голос", "Спутник", "Незаменимый"];
const EVO_AT = [0, 10, 30, 60, 100, 200];

function boardingCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const alphabet = letters + "23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  if (![...code].some((c) => letters.includes(c))) code = "A" + code.slice(1);
  return code;
}

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
function evoOf(n: number) {
  let lv = 1;
  for (let i = 0; i < EVO_AT.length; i++) if (n >= EVO_AT[i]) lv = i + 1;
  return { lv: Math.min(6, lv), name: EVO[Math.min(6, lv)] };
}

const BIND_KEY = (pilot: string, id: string) => `st_orion_bind:${pilot}:${id}`;
const CODE_KEY = (pilot: string, id: string) => `st_orion_code:${pilot}:${id}`;

type Bind = { oc: string; gh: string; code: string };
function loadBind(pilot: string, id: string): Bind {
  try {
    const raw = localStorage.getItem(BIND_KEY(pilot, id));
    const code = localStorage.getItem(CODE_KEY(pilot, id)) || "";
    if (raw) return { ...(JSON.parse(raw) as Bind), code: code || (JSON.parse(raw) as Bind).code };
    return { oc: "", gh: "", code };
  } catch {
    return { oc: "", gh: "", code: "" };
  }
}
function saveBind(pilot: string, id: string, b: Bind) {
  localStorage.setItem(BIND_KEY(pilot, id), JSON.stringify({ oc: b.oc, gh: b.gh, code: b.code }));
  localStorage.setItem(CODE_KEY(pilot, id), b.code);
}

type Props = { cfg: OrionConfig; replicaCount?: number; onChange?: () => void; connectOpen?: boolean };

export default function AgentsPage({ cfg, replicaCount = 0, onChange }: Props) {
  const [items, setItems] = useState<CrewAgent[]>([]);
  const [active, setActive] = useState("");
  const [sel, setSel] = useState<string>("");
  const [draft, setDraft] = useState<Partial<CrewAgent>>({});
  const [isNew, setIsNew] = useState(false);
  const [bind, setBind] = useState<Bind>({ oc: "", gh: "", code: "" });
  const [note, setNote] = useState("");
  const [modeErr, setModeErr] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await orionApi.agents();
      setItems(r.items);
      setActive(r.active);
      setSel((s) => s || r.active || r.items[0]?.agent_id || "");
    } catch (e) {
      setNote(ot("error", (e as Error).message));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const rec = useMemo(() => items.find((x) => x.agent_id === sel) || null, [items, sel]);
  useEffect(() => {
    if (!rec || isNew) return;
    setDraft({ ...rec });
    const b = loadBind(cfg.pilot, rec.agent_id);
    if (!b.code) {
      b.code = boardingCode();
      saveBind(cfg.pilot, rec.agent_id, b);
    }
    setBind(b);
  }, [rec, isNew, cfg.pilot]);

  const blank = (): Partial<CrewAgent> => ({
    name: "Орион",
    kind: "openai_compat",
    access: "crew",
    enabled: true,
    provider: "openai",
    base_url: PRESETS.openai.base_url,
    model: PRESETS.openai.model,
    vision: false,
    manners: "",
    note: "",
    voice: "ship",
  });

  const pick = (id: string) => {
    setIsNew(false);
    setSel(id);
    setNote("");
  };

  const save = async () => {
    setNote("");
    try {
      if (isNew) {
        const a = await orionApi.createAgent(draft);
        if (bind.oc) saveAgentKey(cfg.pilot, a.agent_id, bind.oc);
        saveBind(cfg.pilot, a.agent_id, { ...bind, code: bind.code || boardingCode() });
        setIsNew(false);
        setSel(a.agent_id);
      } else if (rec) {
        await orionApi.updateAgent(rec.agent_id, { ...rec, ...draft });
        if (bind.oc) saveAgentKey(cfg.pilot, rec.agent_id, bind.oc);
        else saveAgentKey(cfg.pilot, rec.agent_id, "");
        saveBind(cfg.pilot, rec.agent_id, bind);
      }
      await reload();
      onChange?.();
    } catch (e) {
      setNote(ot("error", (e as Error).message));
    }
  };

  const activate = async () => {
    if (!rec) return;
    await orionApi.activateAgent(rec.agent_id);
    await reload();
    onChange?.();
  };

  const dismiss = async (id: string) => {
    await orionApi.deleteAgent(id);
    saveAgentKey(cfg.pilot, id, "");
    await reload();
    onChange?.();
  };

  const evo = evoOf(replicaCount);
  const hasKey = rec ? loadAgentKey(cfg.pilot, rec.agent_id) || bind.oc : bind.oc;

  return (
    <div className="orion-screen" data-testid="orion-agents">
      <div className="orion-agents-grid">
        <aside className="inst-panel orion-crew-col">
          <h3>{ot("passengers")}</h3>
          {items.map((a) => (
            <button
              key={a.agent_id}
              type="button"
              className={"orion-pass" + (a.agent_id === sel && !isNew ? " on" : "")}
              data-testid={"orion-agent-" + a.agent_id}
              onClick={() => pick(a.agent_id)}
            >
              <span className="orion-pass-row">
                <b>{a.name}</b>
                {a.agent_id === active ? <span className="orion-tag">{ot("crew_active")}</span> : null}
                {a.agent_id !== "orion" ? (
                  <span className="orion-pass-x" onClick={(e) => { e.stopPropagation(); void dismiss(a.agent_id); }}>✕</span>
                ) : null}
              </span>
              <span className="orion-pass-sub">{ot("k_" + a.kind)}{a.model ? " · " + a.model : ""}</span>
              <span className="orion-pass-sub">{accLab(a.access)}</span>
            </button>
          ))}
          <div className="muted" style={{ fontSize: "0.78rem" }}>{ot("executor")}</div>
          <button type="button" className="hud-btn amber" onClick={() => { setIsNew(true); setDraft(blank()); setBind({ oc: "", gh: "", code: boardingCode() }); }}>
            {ot("new_agent")}
          </button>
        </aside>

        <div className="orion-card-col">
          <section className="inst-panel">
            <h3>{ot("card")}</h3>
            <label className="orion-field">
              {ot("fld_name")}
              <input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <span className="hint">{ot("name_hint")}</span>
            </label>
            <label className="orion-field">
              {ot("fld_model")}
              <input value={draft.model || ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
              <span className="hint">{ot("model_hint")}</span>
            </label>
            <label className="orion-field">
              {ot("fld_note")}
              <input value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              <span className="hint">{ot("note_hint")}</span>
            </label>
            <div className="orion-field">
              {ot("rights")}
              <div className="orion-rights">
                {(["crew", "observer", "commander"] as const).map((k) => (
                  <button key={k} type="button" className={"hud-btn" + (draft.access === k ? " amber" : "")} onClick={() => setDraft({ ...draft, access: k })}>
                    {accLab(k)}
                  </button>
                ))}
              </div>
              <span className="hint">{ot("rights_hint")}</span>
            </div>
            <div className="orion-field">
              {ot("fld_voice")}
              <button type="button" className="hud-btn" onClick={() => {
                const order = ["ship", "agent", "off"];
                const i = order.indexOf(draft.voice || "ship");
                setDraft({ ...draft, voice: order[(i + 1) % 3] });
              }}>
                {ot("fld_voice")}: {voiceLab(draft.voice || "ship")}
              </button>
            </div>
            <div className="orion-field">
              {ot("on_board")}
              <button type="button" className={"hud-btn" + (draft.enabled ? " amber" : "")} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}>
                {ot("on_board")}: {draft.enabled ? ot("on_yes") : ot("on_no")}
              </button>
            </div>
            <div className="orion-card-actions">
              <button type="button" className="hud-btn amber" onClick={() => void save()}>{ot("save")}</button>
              <button type="button" className="hud-btn" disabled={isNew || !rec} onClick={() => void activate()}>{ot("make_active")}</button>
              <button type="button" className="hud-btn danger" disabled={isNew || rec?.agent_id === "orion"} onClick={() => rec && void dismiss(rec.agent_id)}>{ot("remove")}</button>
            </div>
          </section>

          <section className="inst-panel orion-bind">
            <h3>{ot("bind")}</h3>
            <div className="orion-field">
              {ot("board_code")}
              <div className="orion-code">{(bind.code || "————").split("").join(" ")}</div>
              <span className="hint">{ot("board_code_hint")}</span>
            </div>
            <label className="orion-field">
              {ot("oc_token")}
              <input type="password" autoComplete="new-password" value={bind.oc} placeholder={hasKey ? maskKey(String(hasKey)) : ""} onChange={(e) => setBind({ ...bind, oc: e.target.value })} />
            </label>
            <label className="orion-field">
              {ot("gh_token")}
              <input type="password" autoComplete="new-password" value={bind.gh} onChange={(e) => setBind({ ...bind, gh: e.target.value })} />
            </label>
            <label className="orion-field">
              {ot("byo_url")}
              <input value={draft.base_url || ""} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} />
            </label>
            <label className="orion-field">
              {ot("crew_kind")}
              <select value={draft.kind || "openai_compat"} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k} value={k}>{ot("k_" + k)}</option>)}
              </select>
            </label>
            <label className="orion-field">
              {ot("byo_provider")}
              <select value={Object.keys(PRESETS).find((k) => PRESETS[k].base_url === draft.base_url) || "openai"} onChange={(e) => {
                const p = PRESETS[e.target.value];
                if (p) setDraft({ ...draft, provider: p.provider, base_url: p.base_url, model: p.model || draft.model });
              }}>
                {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <div className="orion-card-actions">
              <button type="button" className="hud-btn" onClick={() => setNote(hasKey ? ot("bind_ok") : ot("bind_no"))}>{ot("check_bind")}</button>
              <button type="button" className="hud-btn amber" onClick={() => void save()}>{ot("save_bind")}</button>
              <button type="button" className="hud-btn danger" onClick={() => {
                setBind({ oc: "", gh: "", code: bind.code });
                if (rec) saveAgentKey(cfg.pilot, rec.agent_id, "");
              }}>{ot("forget_bind")}</button>
            </div>
            <div className="hint muted">{ot("bind_local")}</div>
            <div className={"orion-note" + (cfg.opencode?.available ? "" : "")} data-testid="orion-opencode">
              {cfg.opencode?.available
                ? `OpenCode: ${cfg.opencode.model || "opencode/deepseek-v4.1-flash-free"}`
                : "OpenCode на хосте не найден — запустите start-star-typing-web.bat (мост :8765)."}
            </div>
            {note ? <div className="orion-note">{note}</div> : null}
          </section>

          <section className="inst-panel">
            <h3>{ot("evo")}</h3>
            <div>{ot("evo_n", evo.lv, evo.name, replicaCount)}</div>
          </section>

          <section className="inst-panel">
            <h3>{ot("manners")}</h3>
            <textarea rows={5} value={draft.manners || ""} onChange={(e) => setDraft({ ...draft, manners: e.target.value })} />
            <button type="button" className="hud-btn amber" onClick={() => void save()}>{ot("save_manners")}</button>
          </section>

          <section className="inst-panel" data-testid="orion-settings">
            <h3>{ot("mode")}</h3>
            <div className="orion-modes">
              {(["guide", "byo", "hosted", "contributor"] as const).map((id) => {
                const m = cfg.modes.find((x) => x.id === id);
                const on = cfg.mode === id;
                const locked = !m?.available;
                return (
                  <div key={id} className={`orion-mode ${on ? "on" : ""} ${locked ? "locked" : ""}`} data-testid={`orion-mode-${id}`} data-locked={locked ? "1" : "0"}>
                    <div className="orion-mode-head">
                      <b>{locked ? "🔒 " : ""}{ot(`m_${id}`)}</b>
                      {on ? <span className="orion-tag">{ot("active")}</span> : (
                        <button type="button" className="hud-btn" disabled={locked} data-testid={`orion-choose-${id}`} onClick={() => orionApi.setMode(id).then(() => onChange?.()).catch((e: Error) => setModeErr(e.message))}>{ot("choose")}</button>
                      )}
                    </div>
                    <div>{ot(`m_${id}_d`)}</div>
                    {locked && m?.reason ? <div className="orion-mode-lock" data-testid={`orion-lock-${id}`}>{ot(`r_${m.reason}`)}</div> : null}
                  </div>
                );
              })}
            </div>
            {modeErr ? <div className="orion-note">{ot("error", modeErr)}</div> : null}
          </section>
        </div>
      </div>
    </div>
  );
}