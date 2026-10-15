/**
 * «ВХОД В КАБИНУ» — порт stamina/pilot_screens (выбор пилота, зачисление, код, скин)
 * + перенос пилотов с десктопа (.stpilot / zip / папка %APPDATA%\Stamina).
 * Один экран без прокрутки (≥1366×768), полностью с клавиатуры, F1 — справка по режиму.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- FileSystemEntry API и JSON ответов без схем */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_SKINS, useSkin } from "../theme/skinStore";
import { skinRank } from "../theme/voice";
import { cycleGuide, guideById, GUIDES, NO_GUIDE } from "../guide/guides";
import { loadGuideState, saveGuideState, useGuide } from "../guide/guideStore";
import { speakGuide } from "../guide/voice";
import { linesOf } from "../guide/guides";
import { addressOf, fill } from "../guide/guideLogic";
import type { SkinTheme } from "../theme/applyTheme";
import { getLang } from "../i18n";
import { te } from "./entryI18n";
import { entryHelp, type EntryView } from "./entryHelp";
import "./entry.css";

export type RosterCard = {
  id: number;
  callsign: string;
  display_name: string;
  accent: string;
  skin: string;
  xp: number;
  xp_lo: number;
  xp_hi: number | null;
  rank: string;
  avatar_data?: string;
  is_guest?: boolean;
  has_pin?: boolean;
  best_cpm: number;
  sessions: number;
  last_at?: string | null;
};

export type EnteredPilot = { id: number; callsign: string; skin: string; xp: number; rank?: string; xp_next?: number };

export type ImportClient = {
  cabin?: Record<string, unknown>;
  lang?: string;
  cargo?: { text: string; original: string; index: number; typed: number; errors: number; elapsed: number };
  radio?: Record<string, unknown>;
};

type Props = {
  mode?: "gate" | "settings";
  onEntered?: (p: EnteredPilot) => void;
  onImportedClient?: (c: ImportClient) => void;
  onExit?: () => void;
};

export const GLYPHS = ["★", "☄", "✈", "♆", "⚡", "◉", "▲", "♛", "⚓", "☾", "✪", "☢", "✦", "⬡", "♞", "⊕"];
export const ACCENTS: Record<string, string> = {
  cyan: "#4dd0e1",
  amber: "#ffb300",
  green: "#66bb6a",
  purple: "#b388ff",
  red: "#ef5350",
  magenta: "#f06292",
};
const SKIN_ICON: Record<string, string> = {
  spaceship: "✦",
  bathyscaphe: "◒",
  steampunk: "⚙",
  scriptorium: "✒",
  neon_city: "◈",
  zen_garden: "☯",
  old_england: "☎",
};
const PER_PAGE = 6;
const COLS = 3;

function skinName(s: SkinTheme): string {
  const n = s.name;
  if (typeof n === "string") return n;
  return (n && (n[getLang()] || n.en || n.ru)) || s.id;
}

function skinById(id: string): SkinTheme {
  return ALL_SKINS.find((s) => s.id === id) || ALL_SKINS[0]!;
}

export function Emblem({ data, accent, size = 48 }: { data?: string; accent?: string; size?: number }) {
  const color = ACCENTS[accent || "cyan"] || ACCENTS.cyan;
  const style = { width: size, height: size, fontSize: size * 0.55, color, borderColor: color };
  if (data?.startsWith("data:image/")) {
    return <img className="ce-emblem" src={data} alt="" style={style} />;
  }
  const g = data?.startsWith("emoji:") ? data.slice(6) : "★";
  return (
    <span className="ce-emblem" style={style} aria-hidden>
      {g}
    </span>
  );
}

/** Мини-кабина в цветах скина — живое превью. */
export function SkinPreview({ skinId, glyph, accent }: { skinId: string; glyph?: string; accent?: string }) {
  const s = skinById(skinId);
  const c = s.colors;
  const font = (s.fonts?.title || []).map((f) => `"${f}"`).join(",") || "inherit";
  const tfont = (s.fonts?.typing || []).map((f) => `"${f}"`).join(",") || "monospace";
  return (
    <div
      className="ce-preview"
      style={{
        background: `radial-gradient(ellipse at 30% 20%, ${c.bg2 || c.bg}, ${c.bg})`,
        borderColor: c.line || c.cyan,
        color: c.text,
      }}
      aria-label={skinName(s)}
    >
      <div className="ce-pv-head" style={{ fontFamily: font, color: c.accent || c.cyan }}>
        <span>{SKIN_ICON[s.id] || "✦"}</span> {skinName(s)}
      </div>
      <div className="ce-pv-panel" style={{ background: c.panel, borderColor: c.line }}>
        <span style={{ color: c.cyan_dim || c.muted, fontFamily: tfont }}>the quick </span>
        <span style={{ color: c.cyan, fontFamily: tfont }}>brown</span>
        <span className="ce-pv-cursor" style={{ background: c.accent || c.cyan, color: c.bg, fontFamily: tfont }}>
          f
        </span>
        <span style={{ color: c.muted, fontFamily: tfont }}>ox jumps</span>
      </div>
      <div className="ce-pv-row">
        <span className="ce-pv-chip" style={{ borderColor: c.ok, color: c.ok }}>
          ✓ 98%
        </span>
        <span className="ce-pv-chip" style={{ borderColor: c.accent, color: c.accent }}>
          312 cpm
        </span>
        <span className="ce-pv-glyph" style={{ color: ACCENTS[accent || "cyan"] }}>
          {glyph || ""}
        </span>
      </div>
    </div>
  );
}

function errText(detail: unknown): string {
  if (detail && typeof detail === "object") {
    const d = detail as { code?: string; detail?: string };
    if (d.code) {
      const k = d.code === "callsign taken" ? d.code : `e_${d.code}`;
      const s = te(k, d.detail || "");
      if (s !== k) return s;
      const s2 = te(d.code);
      return s2 !== d.code ? s2 : d.code;
    }
  }
  if (typeof detail === "string") {
    const s = te(detail);
    return s;
  }
  return String(detail ?? "");
}

async function readJson(r: Response): Promise<{ ok: boolean; status: number; body: any }> {
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { ok: r.ok, status: r.status, body };
}

type Preview = {
  token: string;
  me: string | null;
  pilots: {
    source_id: string;
    callsign: string;
    name: string;
    accent: string;
    avatar: string;
    has_pin: boolean;
    skin: string;
    xp: number;
    counts: Record<string, number | boolean>;
    callsign_taken: boolean;
    already_imported_into: number[];
    can_merge: boolean;
  }[];
};

/* ---------- обход папки при drag&drop ---------- */
type FileWithPath = { file: File; path: string };
async function walkEntry(entry: any, prefix: string, out: FileWithPath[]): Promise<void> {
  if (!entry) return;
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: prefix + entry.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, `${prefix}${entry.name}/`, out);
    }
  }
}

export default function CockpitEntry({ mode = "gate", onEntered, onImportedClient, onExit }: Props) {
  const [roster, setRoster] = useState<RosterCard[] | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [sel, setSel] = useState(0);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<EntryView>("roster");
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" | "info" } | null>(null);
  const [pin, setPin] = useState("");
  const [lockLeft, setLockLeft] = useState(0);
  const [previewSkin, setPreviewSkin] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [honor, setHonor] = useState<{ callsign: string; xp: number; best_cpm: number; sessions: number }[]>([]);
  const [firstIdx, setFirstIdx] = useState(0);
  // мастер
  const [step, setStep] = useState(1);
  const [wCall, setWCall] = useState("");
  const [wName, setWName] = useState("");
  const [wGlyph, setWGlyph] = useState(0);
  const [wAccent, setWAccent] = useState("cyan");
  const [wSkin, setWSkin] = useState("spaceship");
  const [wPin, setWPin] = useState("");
  const [wPin2, setWPin2] = useState("");
  const [busy, setBusy] = useState(false);
  // перенос
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvSel, setPvSel] = useState(0);
  const [pvMode, setPvMode] = useState<"new" | "merge">("new");
  const [report, setReport] = useState<{ report: Record<string, any>; pilot: any } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pinRef = useRef<HTMLInputElement>(null);
  const callRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  const say = (text: string, kind: "ok" | "err" | "info" = "info") => setMsg({ text, kind });

  const refresh = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        fetch("/api/pilots/roster", { credentials: "include" }),
        fetch("/api/pilots/me", { credentials: "include" }),
      ]);
      const list = r.ok ? ((await r.json()) as RosterCard[]) : [];
      const me = m.ok ? await m.json() : null;
      setRoster(list);
      setMeId(me?.id ?? null);
      if (me?.id) {
        const i = list.findIndex((p) => p.id === me.id);
        if (i >= 0) {
          setSel(i);
          setPage(Math.floor(i / PER_PAGE));
        }
      } else {
        const last = localStorage.getItem("st_last_pilot");
        const i = list.findIndex((p) => p.callsign === last);
        if (i >= 0) {
          setSel(i);
          setPage(Math.floor(i / PER_PAGE));
        }
      }
      if (!list.filter((p) => !p.is_guest).length && view === "roster") setView("first");
    } catch {
      setRoster([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (lockLeft <= 0) return;
    const id = window.setInterval(() => setLockLeft((x) => Math.max(0, x - 1)), 1000);
    return () => window.clearInterval(id);
  }, [lockLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = roster || [];
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const selected: RosterCard | undefined = list[sel];
  const shownSkin = previewSkin || selected?.skin || "spaceship";

  // Живой предпросмотр: весь экран входа сразу принимает выбранный скин (без сохранения).
  useEffect(() => {
    const cur = view === "wizard" ? wSkin : shownSkin;
    if (useSkin.getState().skin.id !== cur) useSkin.getState().previewSkin(cur);
  }, [shownSkin, wSkin, view]);

  useEffect(() => {
    setPin("");
    setPreviewSkin(null);
    setConfirmDel(null);
  }, [sel]);

  useEffect(() => {
    if (view === "roster" && selected?.has_pin && selected.id !== meId) pinRef.current?.focus();
    else if (view === "roster") rootRef.current?.focus();
  }, [view, sel, selected?.has_pin, meId]);

  useEffect(() => {
    if (view === "wizard" && step === 1) callRef.current?.focus();
  }, [view, step]);

  /* ---------- гид (на пилота, localStorage) ---------- */
  const guideOwner = selected?.callsign || "";
  const [guideId, setGuideId] = useState<string>(NO_GUIDE);
  useEffect(() => {
    if (guideOwner) setGuideId(loadGuideState(guideOwner).id);
  }, [guideOwner]);
  const pickGuide = (id: string) => {
    if (!guideOwner || (id !== NO_GUIDE && guideById(id)?.soon)) return;
    setGuideId(id);
    const g = useGuide.getState();
    if (g.pilot === guideOwner) g.patch({ id });
    else saveGuideState(guideOwner, { ...loadGuideState(guideOwner), id });
  };
  const sampleGuide = () => {
    if (guideId === NO_GUIDE) return;
    const line = linesOf(guideId)?.sample?.default?.[0];
    if (line) speakGuide(guideId, fill(line, { sir: addressOf(), pilot: guideOwner }));
  };

  const entered = (p: { id: number; callsign: string; skin: string; xp: number }, card?: RosterCard) => {
    localStorage.setItem("st_last_pilot", p.callsign);
    onEntered?.({
      id: p.id,
      callsign: p.callsign,
      skin: p.skin,
      xp: p.xp,
      rank: card?.rank,
      xp_next: card?.xp_hi ?? undefined,
    });
  };

  /* ---------- вход ---------- */
  const takeoff = async () => {
    if (!selected || busy) return;
    if (lockLeft > 0) return;
    if (selected.id === meId) {
      if (previewSkin && previewSkin !== selected.skin) await saveSkin(previewSkin);
      entered({ ...selected, skin: previewSkin || selected.skin }, selected);
      return;
    }
    if (selected.has_pin && !pin) {
      pinRef.current?.focus();
      say(te("pin"), "info");
      return;
    }
    setBusy(true);
    const res = await readJson(
      await fetch("/api/pilots/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign: selected.callsign, pin }),
      }),
    );
    setBusy(false);
    if (!res.ok) {
      const d = res.body?.detail || {};
      setPin("");
      if (res.status === 429 || d.retry_after > 0) {
        setLockLeft(Number(d.retry_after) || 30);
      }
      say(res.status === 429 ? te("pin_wait", d.retry_after || 30) : te("pin_bad", d.fails || 1), "err");
      pinRef.current?.focus();
      return;
    }
    let skin = res.body.skin;
    if (previewSkin && previewSkin !== skin) {
      await saveSkin(previewSkin);
      skin = previewSkin;
    }
    entered({ ...res.body, skin }, selected);
  };

  const saveSkin = async (id: string) => {
    const r = await fetch("/api/pilots/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skin: id }),
    });
    if (r.ok) {
      setRoster((rs) => (rs || []).map((p) => (p.id === meId ? { ...p, skin: id } : p)));
      say(te("skin_saved"), "ok");
    }
  };

  const pickSkin = (id: string) => {
    setPreviewSkin(id);
    if (selected && selected.id === meId) void saveSkin(id);
    else say(te("skin_after_login"), "info");
  };

  const cycleSkin = (dir: 1 | -1) => {
    const ids = ALL_SKINS.map((s) => s.id);
    const i = ids.indexOf(shownSkin);
    pickSkin(ids[(i + dir + ids.length) % ids.length]!);
  };

  const guest = async () => {
    const res = await readJson(await fetch("/api/pilots/guest", { method: "POST", credentials: "include" }));
    if (res.ok) {
      say(te("guest_note"), "info");
      entered(res.body);
    } else say(te("err_generic", res.status), "err");
  };

  const logout = async () => {
    await fetch("/api/pilots/logout", { method: "POST", credentials: "include" });
    setMeId(null);
    void refresh();
  };

  const exportMe = () => {
    window.location.href = "/api/import/export";
  };

  const dismiss = async () => {
    if (!selected || confirmDel === null) return;
    if (confirmDel.trim().toLowerCase() !== selected.callsign.toLowerCase()) return;
    const res = await readJson(
      await fetch(`/api/pilots/${selected.id}`, { method: "DELETE", credentials: "include" }),
    );
    setConfirmDel(null);
    if (res.ok) {
      say(te("dismiss_ok"), "ok");
      setSel(0);
      setPage(0);
      void refresh();
    } else say(te("err_generic", errText(res.body?.detail)), "err");
  };

  const openHonor = async () => {
    try {
      setHonor(await (await fetch("/api/pilots/honor")).json());
    } catch {
      setHonor([]);
    }
    setView("honor");
  };

  /* ---------- мастер ---------- */
  const startWizard = () => {
    setStep(1);
    setWCall("");
    setWName("");
    setWGlyph(0);
    setWAccent("cyan");
    setWSkin("spaceship");
    setWPin("");
    setWPin2("");
    setMsg(null);
    setView("wizard");
  };

  const callsignErr = (cs: string): string => {
    const c = cs.trim();
    if (c.length < 2) return te("callsign_short");
    if (c.length > 16) return te("callsign_long");
    if (!/^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ][0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ -]{1,15}$/.test(c)) return te("callsign_chars");
    if (list.some((p) => p.callsign.toLowerCase() === c.toLowerCase())) return te("callsign taken");
    return "";
  };

  const wizardNext = async () => {
    if (step === 1) {
      const e = callsignErr(wCall);
      if (e) {
        say(e, "err");
        return;
      }
      setMsg(null);
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (wPin && !/^\d{4,8}$/.test(wPin)) {
      say(te("pin_length"), "err");
      return;
    }
    if (wPin !== wPin2) {
      say(te("pin_mismatch"), "err");
      return;
    }
    setBusy(true);
    const res = await readJson(
      await fetch("/api/pilots/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callsign: wCall.trim(),
          display_name: wName.trim(),
          pin: wPin,
          skin: wSkin,
          accent: wAccent,
          avatar: GLYPHS[wGlyph],
        }),
      }),
    );
    setBusy(false);
    if (!res.ok) {
      say(errText(res.body?.detail), "err");
      return;
    }
    entered(res.body);
  };

  /* ---------- перенос ---------- */
  const startImport = () => {
    setPv(null);
    setReport(null);
    setMsg(null);
    setView("import");
  };

  const upload = async (items: FileWithPath[]) => {
    if (!items.length) return;
    setBusy(true);
    say(te("imp_reading"), "info");
    const fd = new FormData();
    const single = items.length === 1;
    for (const it of items) {
      fd.append("files", it.file, it.file.name);
      if (!single) fd.append("paths", it.path);
    }
    const res = await readJson(await fetch("/api/import/preview", { method: "POST", body: fd, credentials: "include" }));
    setBusy(false);
    if (!res.ok) {
      say(errText(res.body?.detail) || te("err_generic", res.status), "err");
      return;
    }
    setPv(res.body as Preview);
    setPvSel(0);
    setPvMode("new");
    setMsg(null);
  };

  const onFiles = (fl: FileList | null) => {
    if (!fl) return;
    const items: FileWithPath[] = Array.from(fl).map((f) => ({
      file: f,
      path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }));
    void upload(items);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const out: FileWithPath[] = [];
    const its = Array.from(e.dataTransfer.items || []);
    const entries = its.map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      for (const en of entries) await walkEntry(en, "", out);
    } else {
      for (const f of Array.from(e.dataTransfer.files)) out.push({ file: f, path: f.name });
    }
    void upload(out);
  };

  const commitImport = async () => {
    if (!pv || busy) return;
    const p = pv.pilots[pvSel];
    if (!p) return;
    if (pvMode === "merge" && !p.can_merge) {
      say(te("imp_merge_login"), "err");
      return;
    }
    setBusy(true);
    say(te("imp_busy"), "info");
    const res = await readJson(
      await fetch("/api/import/commit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pv.token, source_id: p.source_id, mode: pvMode }),
      }),
    );
    setBusy(false);
    if (!res.ok) {
      say(res.status === 410 ? te("err_expired") : errText(res.body?.detail), "err");
      return;
    }
    setReport({ report: res.body.report, pilot: res.body.pilot });
    if (res.body.client) onImportedClient?.(res.body.client as ImportClient);
    say(te("imp_done"), "ok");
    void refresh();
  };

  const firstActions = [
    { k: "1", icon: "＋", t: te("first_new"), d: te("first_new_d"), run: startWizard },
    { k: "2", icon: "⇪", t: te("first_import"), d: te("first_import_d"), run: startImport },
    { k: "3", icon: "☄", t: te("first_guest"), d: te("first_guest_d"), run: () => void guest() },
  ];

  /* ---------- клавиатура ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const inField = !!tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA");
      if (e.key === "F1") {
        e.preventDefault();
        e.stopPropagation();
        setHelp((h) => !h);
        return;
      }
      if (help) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setHelp(false);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (view === "honor") {
        if (e.key === "Escape" || e.key.toLowerCase() === "h" || e.key.toLowerCase() === "р") {
          stop();
          setView(list.length ? "roster" : "first");
        }
        return;
      }

      if (view === "first") {
        if (["1", "2", "3"].includes(e.key)) {
          stop();
          firstActions[Number(e.key) - 1]!.run();
        } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          stop();
          setFirstIdx((i) => (i + 1) % 3);
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          stop();
          setFirstIdx((i) => (i + 2) % 3);
        } else if (e.key === "Enter") {
          stop();
          firstActions[firstIdx]!.run();
        } else if (e.key === "Escape" && mode === "gate") {
          stop();
          onExit?.();
        }
        return;
      }

      if (view === "wizard") {
        if (e.key === "Escape") {
          stop();
          if (step > 1) setStep(step - 1);
          else setView(list.length ? "roster" : "first");
        } else if (e.key === "Enter") {
          stop();
          void wizardNext();
        } else if (!inField && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
          const d = e.key === "ArrowRight" ? 1 : -1;
          const grp = tgt?.closest("[data-grp]")?.getAttribute("data-grp");
          if (step === 2 && grp === "accent") {
            stop();
            const ks = Object.keys(ACCENTS);
            setWAccent(ks[(ks.indexOf(wAccent) + d + ks.length) % ks.length]!);
          } else if (step === 2) {
            stop();
            setWGlyph((g) => (g + d + GLYPHS.length) % GLYPHS.length);
          } else if (step === 3 && grp !== "pin") {
            stop();
            const ids = ALL_SKINS.map((s) => s.id);
            setWSkin(ids[(ids.indexOf(wSkin) + d + ids.length) % ids.length]!);
          }
        }
        return;
      }

      if (view === "import") {
        if (e.key === "Escape") {
          stop();
          if (pv && !report) setPv(null);
          else setView(list.length ? "roster" : "first");
          return;
        }
        if (inField) return;
        if (report) {
          if (e.key === "Enter") {
            stop();
            const p = report.pilot;
            entered(p);
          } else if (e.key.toLowerCase() === "i") {
            stop();
            startImport();
          }
          return;
        }
        if (!pv) {
          if (e.key === "Enter" || e.key === " ") {
            stop();
            fileRef.current?.click();
          } else if (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "а") {
            stop();
            dirRef.current?.click();
          }
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          stop();
          const n = pv.pilots.length;
          setPvSel((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        } else if (e.key.toLowerCase() === "m" || e.key.toLowerCase() === "ь") {
          stop();
          setPvMode((m) => (m === "new" ? "merge" : "new"));
        } else if (e.key === "Enter") {
          stop();
          void commitImport();
        }
        return;
      }

      /* roster */
      if (confirmDel !== null) {
        if (e.key === "Escape") {
          stop();
          setConfirmDel(null);
        } else if (e.key === "Enter") {
          stop();
          void dismiss();
        }
        return;
      }
      const pinField = tgt === pinRef.current;
      if (inField && !pinField) return;
      const n = list.length;
      const move = (to: number) => {
        if (!n) return;
        const v = Math.max(0, Math.min(n - 1, to));
        setSel(v);
        setPage(Math.floor(v / PER_PAGE));
      };
      if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        stop();
        pickGuide(cycleGuide(guideId, e.key === "ArrowRight" ? 1 : -1));
        return;
      }
      switch (e.key) {
        case "ArrowRight":
          stop();
          move(sel + 1);
          return;
        case "ArrowLeft":
          stop();
          move(sel - 1);
          return;
        case "ArrowDown":
          stop();
          move(sel + COLS);
          return;
        case "ArrowUp":
          stop();
          move(sel - COLS);
          return;
        case "PageDown":
          stop();
          move((page + 1) * PER_PAGE);
          return;
        case "PageUp":
          stop();
          move((page - 1) * PER_PAGE);
          return;
        case "Home":
          stop();
          move(0);
          return;
        case "End":
          stop();
          move(n - 1);
          return;
        case "Enter":
          stop();
          void takeoff();
          return;
        case "Delete":
          if (pinField && pin) return;
          stop();
          if (selected) setConfirmDel("");
          return;
        case "Escape":
          stop();
          if (pinField && pin) setPin("");
          else if (mode === "gate") onExit?.();
          return;
      }
      if (pinField) return; // цифры идут в поле кода
      const k = e.key.toLowerCase();
      if (/^\d$/.test(e.key) && selected?.has_pin && selected.id !== meId) {
        pinRef.current?.focus();
        return;
      }
      if (k === "n" || k === "т") {
        stop();
        startWizard();
      } else if (k === "i" || k === "ш") {
        stop();
        startImport();
      } else if (k === "g" || k === "п") {
        stop();
        void guest();
      } else if (k === "h" || k === "р") {
        stop();
        void openHonor();
      } else if (k === "s" || k === "ы") {
        stop();
        cycleSkin(e.shiftKey ? -1 : 1);      } else if (k === "p" || k === "з") {
        stop();
        sampleGuide();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const helpSecs = useMemo(() => entryHelp(view), [view, help]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtLast = (iso?: string | null) => {
    if (!iso) return te("never");
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? te("today") : d.toLocaleDateString(getLang());
  };

  const xpFrac = (p: RosterCard) => {
    const hi = p.xp_hi ?? p.xp + 1;
    return Math.max(0, Math.min(100, ((p.xp - p.xp_lo) / Math.max(1, hi - p.xp_lo)) * 100));
  };

  const keysHint =
    view === "wizard" ? te("keys_wizard") : view === "import" ? te("keys_import") : view === "honor" ? te("keys_help") : view === "first" ? te("keys_first") : te("keys_roster");

  /* ---------- разметка ---------- */
  const pageItems = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section
      ref={rootRef}
      className={`ce ${mode === "gate" ? "ce-gate" : "ce-inline"}`}
      tabIndex={-1}
      aria-label={te("title")}
    >
      <header className="ce-head">
        <div>
          <div className="ce-kicker">STAR TYPING</div>
          <h1 className="ce-title">{te("title")}</h1>
          <div className="ce-sub">
            {view === "wizard" ? te("wiz_title", step) : view === "import" ? te("imp_title") : te("sub")}
          </div>
        </div>
        <div className="ce-head-tools">
          {view === "roster" ? <span className="ce-muted">{te("crew_n", list.length)}</span> : null}
          <button type="button" className="ce-btn ghost" onClick={() => void openHonor()} title="H">
            ✪ {te("honor")} <kbd>H</kbd>
          </button>
          <button type="button" className="ce-btn ghost" onClick={() => setHelp(true)} title="F1">
            ? {te("help")} <kbd>F1</kbd>
          </button>
          {mode === "gate" && onExit ? (
            <button type="button" className="ce-btn ghost" onClick={onExit} aria-label={te("close")}>
              ✕ <kbd>Esc</kbd>
            </button>
          ) : null}
        </div>
      </header>

      {msg ? (
        <div className={`ce-msg ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : (
        <div className="ce-msg empty" />
      )}

      <div className="ce-body">
        {roster === null ? <div className="ce-muted">…</div> : null}

        {/* ---------- первый запуск ---------- */}
        {roster !== null && view === "first" ? (
          <div className="ce-first">
            <h2>{te("first_title")}</h2>
            <p className="ce-muted">{te("first_sub")}</p>
            <div className="ce-first-row" role="listbox" aria-label={te("first_title")}>
              {firstActions.map((a, i) => (
                <button
                  key={a.k}
                  type="button"
                  role="option"
                  aria-selected={i === firstIdx}
                  className={`ce-first-card ${i === firstIdx ? "on" : ""}`}
                  onMouseEnter={() => setFirstIdx(i)}
                  onClick={a.run}
                >
                  <span className="ce-first-icon">{a.icon}</span>
                  <strong>{a.t}</strong>
                  <span className="ce-muted">{a.d}</span>
                  <kbd>{a.k}</kbd>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* ---------- экипаж ---------- */}
        {roster !== null && view === "roster" ? (
          <div className="ce-roster">
            <div className="ce-left">
              <div className="ce-actions">
                <button type="button" className="ce-btn" onClick={startWizard}>
                  ＋ {te("new_pilot")} <kbd>N</kbd>
                </button>
                <button type="button" className="ce-btn" onClick={startImport}>
                  ⇪ {te("import")} <kbd>I</kbd>
                </button>
                <button type="button" className="ce-btn ghost" onClick={() => void guest()}>
                  ☄ {te("guest")} <kbd>G</kbd>
                </button>
              </div>
              <div className="ce-grid" role="listbox" aria-label={te("crew_n", list.length)}>
                {pageItems.map((p, k) => {
                  const i = page * PER_PAGE + k;
                  const on = i === sel;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`ce-card ${on ? "on" : ""} ${p.id === meId ? "me" : ""}`}
                      style={{ ["--ce-acc" as string]: ACCENTS[p.accent] || ACCENTS.cyan }}
                      onClick={() => setSel(i)}
                      onDoubleClick={() => void takeoff()}
                    >
                      <Emblem data={p.avatar_data} accent={p.accent} size={46} />
                      <span className="ce-card-txt">
                        <strong className="ce-cs">{p.callsign}</strong>
                        <span className="ce-rank">★ {skinRank(p.rank, getLang())}</span>
                        <span className="ce-xpbar">
                          <i style={{ width: `${xpFrac(p)}%` }} />
                        </span>
                      </span>
                      <span className="ce-card-badges">
                        {p.has_pin ? <span title={te("locked")}>🔒</span> : null}
                        <span className="ce-skin-mini" title={skinName(skinById(p.skin))}>
                          {SKIN_ICON[p.skin] || "✦"}
                        </span>
                        {p.id === meId ? <span className="ce-me">{te("you")}</span> : null}
                      </span>
                    </button>
                  );
                })}
                {Array.from({ length: PER_PAGE - pageItems.length }).map((_, k) => (
                  <div key={`e${k}`} className="ce-card empty" aria-hidden />
                ))}
              </div>
              <div className="ce-pager">
                <button type="button" className="ce-btn ghost sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>
                  ‹ <kbd>PgUp</kbd>
                </button>
                <span className="ce-muted">{te("page", page + 1, pages)}</span>
                <button
                  type="button"
                  className="ce-btn ghost sm"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <kbd>PgDn</kbd> ›
                </button>
              </div>
            </div>

            <aside className="ce-right" style={{ ["--ce-acc" as string]: ACCENTS[selected?.accent || "cyan"] }}>
              {selected ? (
                <>
                  <div className="ce-dossier">
                    <Emblem data={selected.avatar_data} accent={selected.accent} size={72} />
                    <div>
                      <div className="ce-big">{selected.callsign}</div>
                      {selected.display_name && selected.display_name !== selected.callsign ? (
                        <div className="ce-muted">{selected.display_name}</div>
                      ) : null}
                      <div className="ce-rank">
                        ★ {skinRank(selected.rank, getLang())} · {selected.xp} {te("xp")}
                      </div>
                      <div className="ce-xpbar wide">
                        <i style={{ width: `${xpFrac(selected)}%` }} />
                      </div>
                      <div className="ce-muted sm">
                        {selected.xp_hi != null ? te("next_rank", selected.xp_hi - selected.xp) : te("max_rank")}
                      </div>
                    </div>
                  </div>
                  <dl className="ce-stats">
                    <div>
                      <dt>{te("sessions")}</dt>
                      <dd>{selected.sessions}</dd>
                    </div>
                    <div>
                      <dt>{te("best_cpm")}</dt>
                      <dd>{Math.round(selected.best_cpm)}</dd>
                    </div>
                    <div>
                      <dt>{te("last")}</dt>
                      <dd>{fmtLast(selected.last_at)}</dd>
                    </div>
                  </dl>
                  <div className="ce-skinrow" role="radiogroup" aria-label={te("skin")}>
                    <span className="ce-lab">
                      {te("skin")} <kbd>S</kbd>
                    </span>
                    {ALL_SKINS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={shownSkin === s.id}
                        className={`ce-skin ${shownSkin === s.id ? "on" : ""}`}
                        style={{ background: s.colors.panel || s.colors.bg, color: s.colors.accent || s.colors.cyan, borderColor: s.colors.line }}
                        title={skinName(s)}
                        onClick={() => pickSkin(s.id)}
                      >
                        {SKIN_ICON[s.id] || "✦"}
                      </button>
                    ))}
                  </div>
                  <div className="ce-guiderow" role="radiogroup" aria-label={te("guide")}>
                    <span className="ce-lab">
                      {te("guide")} <kbd>⇧←→</kbd> <kbd>P</kbd>
                    </span>
                    {[...GUIDES.map((g) => ({ id: g.id, name: g.name, soon: !!g.soon })), { id: NO_GUIDE, name: te("guide_none"), soon: false }].map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        role="radio"
                        aria-checked={guideId === g.id}
                        disabled={g.soon}
                        className={`ce-guide ${guideId === g.id ? "on" : ""}`}
                        onClick={() => pickGuide(g.id)}
                      >
                        {g.name}
                        {g.soon ? <small>{te("guide_soon")}</small> : null}
                      </button>
                    ))}
                  </div>
                  <SkinPreview
                    skinId={shownSkin}
                    glyph={selected.avatar_data?.startsWith("emoji:") ? selected.avatar_data.slice(6) : "★"}
                    accent={selected.accent}
                  />
                  {confirmDel !== null ? (
                    <div className="ce-confirm">
                      <label>
                        {te("dismiss_q", selected.callsign)}
                        <input
                          autoFocus
                          value={confirmDel}
                          onChange={(e) => setConfirmDel(e.target.value)}
                          aria-label={te("dismiss")}
                        />
                      </label>
                      <button type="button" className="ce-btn danger" onClick={() => void dismiss()}>
                        {te("dismiss")} <kbd>Enter</kbd>
                      </button>
                    </div>
                  ) : (
                    <div className="ce-go">
                      {selected.has_pin && selected.id !== meId ? (
                        <label className="ce-pin">
                          <span>🔒 {te("pin")}</span>
                          <input
                            ref={pinRef}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={32}
                            placeholder={te("pin_ph")}
                            value={pin}
                            disabled={lockLeft > 0}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                            aria-label={te("pin")}
                          />
                          {lockLeft > 0 ? <span className="ce-lock">{te("pin_wait", lockLeft)}</span> : null}
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="ce-btn primary"
                        disabled={busy || lockLeft > 0}
                        onClick={() => void takeoff()}
                      >
                        ▲ {te("takeoff")} <kbd>Enter</kbd>
                      </button>
                      {selected.id === meId ? (
                        <div className="ce-me-tools">
                          <button type="button" className="ce-btn ghost sm" onClick={exportMe}>
                            ⇩ {te("export")}
                          </button>
                          <button type="button" className="ce-btn ghost sm" onClick={() => void logout()}>
                            ⏻ {te("logout")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
            </aside>
          </div>
        ) : null}

        {/* ---------- мастер ---------- */}
        {view === "wizard" ? (
          <div className="ce-wizard">
            <ol className="ce-steps">
              {[te("wiz_s1"), te("wiz_s2"), te("wiz_s3")].map((s, i) => (
                <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""}>
                  <b>{i + 1}</b> {s}
                </li>
              ))}
            </ol>
            <div className="ce-wiz-body">
              <div className="ce-wiz-form">
                {step === 1 ? (
                  <>
                    <label className="ce-field">
                      <span>{te("callsign")}</span>
                      <input
                        ref={callRef}
                        value={wCall}
                        maxLength={16}
                        placeholder={te("callsign_ph")}
                        onChange={(e) => setWCall(e.target.value)}
                        aria-invalid={!!wCall && !!callsignErr(wCall)}
                      />
                      <small className={wCall && callsignErr(wCall) ? "bad" : "ce-muted"}>
                        {wCall ? callsignErr(wCall) || "✓" : te("callsign_hint")}
                      </small>
                    </label>
                    <label className="ce-field">
                      <span>{te("display_name")}</span>
                      <input value={wName} maxLength={64} onChange={(e) => setWName(e.target.value)} />
                    </label>
                  </>
                ) : null}
                {step === 2 ? (
                  <>
                    <div className="ce-lab">{te("emblem")}</div>
                    <div className="ce-glyphs" role="radiogroup" data-grp="glyph" aria-label={te("emblem")}>
                      {GLYPHS.map((g, i) => (
                        <button
                          key={g}
                          type="button"
                          role="radio"
                          aria-checked={i === wGlyph}
                          tabIndex={i === wGlyph ? 0 : -1}
                          className={`ce-glyph ${i === wGlyph ? "on" : ""}`}
                          style={{ color: ACCENTS[wAccent] }}
                          onClick={() => setWGlyph(i)}
                          ref={(el) => {
                            if (el && i === wGlyph && step === 2 && document.activeElement?.closest("[data-grp]")?.getAttribute("data-grp") !== "accent")
                              el.focus();
                          }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <div className="ce-lab">{te("accent")}</div>
                    <div className="ce-accents" role="radiogroup" data-grp="accent" aria-label={te("accent")}>
                      {Object.entries(ACCENTS).map(([k, c]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={k === wAccent}
                          aria-label={k}
                          tabIndex={k === wAccent ? 0 : -1}
                          className={`ce-acc ${k === wAccent ? "on" : ""}`}
                          style={{ background: c }}
                          onClick={() => setWAccent(k)}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
                {step === 3 ? (
                  <>
                    <div className="ce-lab">{te("skin")}</div>
                    <div className="ce-skinpick" role="radiogroup" data-grp="skin" aria-label={te("skin")}>
                      {ALL_SKINS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={wSkin === s.id}
                          tabIndex={wSkin === s.id ? 0 : -1}
                          className={`ce-skin big ${wSkin === s.id ? "on" : ""}`}
                          style={{ background: s.colors.panel || s.colors.bg, color: s.colors.accent || s.colors.cyan, borderColor: s.colors.line }}
                          onClick={() => setWSkin(s.id)}
                          ref={(el) => {
                            if (el && wSkin === s.id && step === 3 && !document.activeElement?.closest("[data-grp='pin']")) el.focus();
                          }}
                        >
                          <span className="ce-skin-ico">{SKIN_ICON[s.id] || "✦"}</span>
                          <span className="ce-skin-name" style={{ color: s.colors.text }}>
                            {skinName(s)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="ce-pinpair" data-grp="pin">
                      <label className="ce-field">
                        <span>{te("pin_opt")}</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={8}
                          value={wPin}
                          onChange={(e) => setWPin(e.target.value.replace(/\D/g, ""))}
                        />
                      </label>
                      <label className="ce-field">
                        <span>{te("pin_repeat")}</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={8}
                          value={wPin2}
                          disabled={!wPin}
                          onChange={(e) => setWPin2(e.target.value.replace(/\D/g, ""))}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
                <div className="ce-wiz-nav">
                  <button
                    type="button"
                    className="ce-btn ghost"
                    onClick={() => (step > 1 ? setStep(step - 1) : setView(list.length ? "roster" : "first"))}
                  >
                    ‹ {te("back")} <kbd>Esc</kbd>
                  </button>
                  <button type="button" className="ce-btn primary" disabled={busy} onClick={() => void wizardNext()}>
                    {step < 3 ? te("next") : te("enroll")} › <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
              <div className="ce-wiz-side">
                <div className="ce-dossier">
                  <Emblem data={`emoji:${GLYPHS[wGlyph]}`} accent={wAccent} size={72} />
                  <div>
                    <div className="ce-big">{wCall.trim() || "—"}</div>
                    <div className="ce-muted">{wName}</div>
                  </div>
                </div>
                <SkinPreview skinId={wSkin} glyph={GLYPHS[wGlyph]} accent={wAccent} />
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------- перенос ---------- */}
        {view === "import" ? (
          <div className="ce-import">
            <input
              ref={fileRef}
              type="file"
              accept=".stpilot,.zip,application/zip"
              hidden
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={dirRef}
              type="file"
              hidden
              multiple
              // @ts-expect-error — нестандартный атрибут выбора папки
              webkitdirectory=""
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {!pv && !report ? (
              <div
                className={`ce-drop ${dragOver ? "over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => void onDrop(e)}
              >
                <div className="ce-drop-ico">⇪</div>
                <strong>{te("imp_drop")}</strong>
                <p className="ce-muted">{te("imp_where")}</p>
                <div className="ce-actions center">
                  <button type="button" className="ce-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {te("imp_file")} <kbd>Enter</kbd>
                  </button>
                  <button type="button" className="ce-btn" disabled={busy} onClick={() => dirRef.current?.click()}>
                    {te("imp_folder")} <kbd>F</kbd>
                  </button>
                </div>
              </div>
            ) : null}
            {pv && !report ? (
              <div className="ce-pv">
                <div className="ce-pv-list" role="listbox" aria-label={te("imp_found", pv.pilots.length)}>
                  <div className="ce-lab">{te("imp_found", pv.pilots.length)}</div>
                  {pv.pilots.map((p, i) => (
                    <button
                      key={p.source_id}
                      type="button"
                      role="option"
                      aria-selected={i === pvSel}
                      className={`ce-card ${i === pvSel ? "on" : ""}`}
                      style={{ ["--ce-acc" as string]: ACCENTS[p.accent] || ACCENTS.cyan }}
                      onClick={() => setPvSel(i)}
                    >
                      <Emblem data={p.avatar ? `emoji:${p.avatar}` : ""} accent={p.accent} size={40} />
                      <span className="ce-card-txt">
                        <strong className="ce-cs">{p.callsign}</strong>
                        <span className="ce-rank">
                          {p.xp} {te("xp")} {p.has_pin ? "· 🔒" : ""}
                        </span>
                        {p.callsign_taken ? <span className="ce-warn">{te("imp_taken", `${p.callsign}-2`)}</span> : null}
                        {p.already_imported_into.length ? <span className="ce-warn">{te("imp_already")}</span> : null}
                      </span>
                      <span className="ce-skin-mini">{SKIN_ICON[p.skin] || "✦"}</span>
                    </button>
                  ))}
                </div>
                <div className="ce-pv-detail">
                  {(() => {
                    const p = pv.pilots[pvSel]!;
                    const keys = [
                      "cards",
                      "words_known",
                      "my_translations",
                      "lists",
                      "warehouse_away",
                      "warehouse_done",
                      "speech_attempts",
                      "english_xp",
                      "runs",
                      "keys",
                      "missions",
                      "speed_sessions",
                      "radio_favorites",
                      "library_texts",
                    ];
                    return (
                      <>
                        <div className="ce-counts">
                          {keys.map((k) => (
                            <div key={k} className={Number(p.counts[k]) ? "" : "zero"}>
                              <b>{Number(p.counts[k] || 0)}</b>
                              <span>{te(`c_${k}`)}</span>
                            </div>
                          ))}
                          <div className={p.counts.cargo ? "" : "zero"}>
                            <b>{p.counts.cargo ? "✓" : "—"}</b>
                            <span>{te("c_cargo")}</span>
                          </div>
                        </div>
                        <div className="ce-modes" role="radiogroup" aria-label="mode">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={pvMode === "new"}
                            className={`ce-btn ${pvMode === "new" ? "sel" : "ghost"}`}
                            onClick={() => setPvMode("new")}
                          >
                            ＋ {te("imp_mode_new")}
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={pvMode === "merge"}
                            className={`ce-btn ${pvMode === "merge" ? "sel" : "ghost"}`}
                            disabled={!p.can_merge}
                            title={p.can_merge ? "" : te("imp_merge_login")}
                            onClick={() => setPvMode("merge")}
                          >
                            ⇄ {te("imp_mode_merge", pv.me || "—")}
                          </button>
                          <kbd>M</kbd>
                        </div>
                        <SkinPreview skinId={p.skin} glyph={p.avatar} accent={p.accent} />
                        <div className="ce-wiz-nav">
                          <button type="button" className="ce-btn ghost" onClick={() => setPv(null)}>
                            ‹ {te("back")} <kbd>Esc</kbd>
                          </button>
                          <button type="button" className="ce-btn primary" disabled={busy} onClick={() => void commitImport()}>
                            ⇪ {te("imp_commit")} <kbd>Enter</kbd>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : null}
            {report ? (
              <div className="ce-report">
                <h2>
                  ✓ {te("imp_done")}: {report.pilot.callsign}
                </h2>
                <div className="ce-counts">
                  {Object.entries(report.report)
                    .filter(([k, v]) => typeof v === "number" && v > 0 && k !== "_library")
                    .map(([k, v]) => (
                      <div key={k}>
                        <b>{v as number}</b>
                        <span>{te(`c_${k}`)}</span>
                      </div>
                    ))}
                </div>
                {report.report.skipped?.length ? (
                  <p className="ce-muted sm">{te("imp_skipped", (report.report.skipped as string[]).join(", "))}</p>
                ) : null}
                <div className="ce-wiz-nav">
                  <button type="button" className="ce-btn ghost" onClick={startImport}>
                    ⇪ {te("imp_more")} <kbd>I</kbd>
                  </button>
                  <button type="button" className="ce-btn primary" onClick={() => entered(report.pilot)}>
                    ▲ {te("imp_go")} <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ---------- почёт ---------- */}
        {view === "honor" ? (
          <div className="ce-honor">
            <h2>✪ {te("honor")}</h2>
            <table className="honor">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{te("callsign")}</th>
                  <th>{te("xp")}</th>
                  <th>{te("best_cpm")}</th>
                  <th>{te("sessions")}</th>
                </tr>
              </thead>
              <tbody>
                {honor.slice(0, 10).map((h, i) => (
                  <tr key={h.callsign}>
                    <td>{i + 1}</td>
                    <td>{h.callsign}</td>
                    <td>{h.xp}</td>
                    <td>{Math.round(h.best_cpm)}</td>
                    <td>{h.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <footer className="ce-foot" aria-hidden>
        {keysHint}
      </footer>

      {help ? (
        <div className="ce-help" role="dialog" aria-modal="true" aria-label={te("help")}>
          <div className="ce-help-box" tabIndex={0} ref={(el) => el?.focus()}>
            <h2>
              F1 · {te("title")} — {view === "wizard" ? te("new_pilot") : view === "import" ? te("import") : view === "honor" ? te("honor") : te("crew_n", list.length)}
            </h2>
            <div className="ce-help-cols">
              {helpSecs.map((s) => (
                <section key={s.h}>
                  <h3>{s.h}</h3>
                  {s.p.map((x) => (
                    <p key={x}>{x}</p>
                  ))}
                </section>
              ))}
            </div>
            <div className="ce-foot">{te("keys_help")}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
