/** Подготовка текста — паритет stamina/screens.CargoScreen. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import {
  DEFAULT_CARGO_OPTS,
  detectLangName,
  fmtEta,
  fmtInt,
  loadCargoBoard,
  PENDING_CARGO_KEY,
  prepareOnServer,
  processText,
  saveCargoBoard,
  type GlueResult,
  type CargoOpts,
} from "./processText";

type Props = {
  onOpenBridge?: () => void;
};

const OPTS: { key: keyof CargoOpts; titleKey: string; descKey: string; def: boolean }[] = [
  { key: "lower", titleKey: "opt_lower", descKey: "opt_lower_desc", def: true },
  { key: "punct", titleKey: "opt_punct", descKey: "opt_punct_desc", def: true },
  { key: "spaces", titleKey: "opt_spaces", descKey: "opt_spaces_desc", def: true },
  { key: "yo", titleKey: "opt_yo", descKey: "opt_yo_desc", def: false },
  { key: "translit", titleKey: "opt_translit", descKey: "opt_translit_desc", def: false },
  { key: "glue", titleKey: "opt_glue", descKey: "opt_glue_desc", def: true },
];

function loadOpts(): CargoOpts {
  try {
    const raw = localStorage.getItem("st_cargo_opts");
    if (!raw) return { ...DEFAULT_CARGO_OPTS };
    return { ...DEFAULT_CARGO_OPTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CARGO_OPTS };
  }
}

export default function CargoPanel({ onOpenBridge }: Props) {
  const [raw, setRaw] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [opts, setOpts] = useState<CargoOpts>(loadOpts);
  const [readonly, setReadonly] = useState(false);
  const [status, setStatus] = useState("");
  const [boardTick, setBoardTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const local = useMemo(() => processText(raw, opts), [raw, opts]);
  const srvKey = `${JSON.stringify(opts)}\u0000${raw}`;
  const [srv, setSrv] = useState<{ key: string; res: GlueResult } | null>(null);
  useEffect(() => {
    if (!opts.glue || !raw.trim()) return;
    const key = srvKey;
    const id = window.setTimeout(() => {
      void prepareOnServer(raw, opts).then((res) => setSrv({ key, res }));
    }, 350);
    return () => window.clearTimeout(id);
  }, [srvKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const glueRes = opts.glue && srv?.key === srvKey ? srv.res : null;
  const adapted = glueRes ? glueRes.text : local;
  const finalText = useCallback(
    async () => (opts.glue && !glueRes && raw.trim() ? (await prepareOnServer(raw, opts)).text : adapted),
    [adapted, glueRes, opts, raw],
  );
  const board = useMemo(() => loadCargoBoard(), [boardTick, adapted]);
  const sameBoard = Boolean(board && board.text === adapted && adapted.length > 0);
  const progressPct = sameBoard && board && board.text.length ? Math.round((board.index / board.text.length) * 100) : 0;

  useEffect(() => {
    localStorage.setItem("st_cargo_opts", JSON.stringify(opts));
  }, [opts]);

  useEffect(() => {
    if (!adapted) {
      setStatus("");
      return;
    }
    if (board && !sameBoard) setStatus(t("cargo_other_text"));
    else if (sameBoard && board)
      setStatus(t("cargo_on_board_progress").replace("{0}", fmtInt(board.index)).replace("{1}", fmtInt(board.text.length)));
    else setStatus("");
  }, [adapted, board, sameBoard]);

  const toggleOpt = (key: keyof CargoOpts) => {
    setOpts((o) => ({ ...o, [key]: !o[key] }));
  };

  const applyToField = async () => {
    if (!adapted) return;
    const text = await finalText();
    setOriginal(raw);
    setRaw(text);
  };

  const clear = () => {
    setRaw("");
    setOriginal(null);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setOriginal(text);
        setRaw(text);
      }
    } catch {
      setStatus(t("cargo_paste_fail"));
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".text") || name.endsWith(".csv")) {
      const text = await file.text();
      setOriginal(text);
      setRaw(text);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name);
    fd.append("lang", "en");
    const r = await fetch("/api/texts/upload", { method: "POST", body: fd, credentials: "include" });
    if (!r.ok) {
      setStatus(await r.text());
      return;
    }
    const doc = await r.json();
    const segs: { original: string }[] = await (await fetch(`/api/texts/${doc.id}/segments?limit=5000`)).json();
    const text = segs.map((s) => s.original).join(" ");
    setOriginal(text);
    setRaw(text);
  };

  const exportTxt = () => {
    const blob = new Blob([raw || adapted], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cargo.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveBoard = useCallback(
    async (start: boolean, fromIndex = 0) => {
      const adapted = await finalText();
      if (!adapted.trim()) {
        setStatus(t("cargo_empty"));
        return;
      }
      saveCargoBoard({
        text: adapted,
        original: original ?? raw,
        index: fromIndex,
      });
      setBoardTick((x) => x + 1);
      if (!start) {
        setStatus(t("cargo_saved"));
        return;
      }
      sessionStorage.setItem(
        PENDING_CARGO_KEY,
        JSON.stringify({
          id: "cargo",
          text: adapted,
          lang: /[а-яё]/i.test(adapted) ? "ru" : "en",
          index: fromIndex,
          original: original ?? raw,
        }),
      );
      onOpenBridge?.();
    },
    [finalText, onOpenBridge, original, raw],
  );

  const previewInfo = !adapted
    ? t("cargo_empty")
    : t("cargo_preview_meta")
        .replace("{0}", fmtInt(adapted.length))
        .replace("{1}", detectLangName(original || adapted))
        .replace("{2}", fmtEta(adapted.length));

  return (
    <section className="cargo-screen">
      <header className="missions-map-head">
        <div>
          <h2 className="route-title">{t("cargo_prep_title")}</h2>
          <p className="muted missions-blurb">{t("cargo_prep_blurb")}</p>
        </div>
      </header>

      <div className="cargo-tools">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.text,.pdf,.epub,text/plain"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="hud-btn" onClick={() => fileRef.current?.click()}>
          {t("open_file")}
        </button>
        <button type="button" className="hud-btn" onClick={() => void paste()}>
          {t("paste_clip")}
        </button>
        <button type="button" className="hud-btn" onClick={clear}>
          {t("clear")}
        </button>
        <button
          type="button"
          className={`hud-btn ${readonly ? "amber" : ""}`}
          onClick={() => setReadonly((v) => !v)}
        >
          {readonly ? t("edit_lock_on") : t("edit_lock_off")}
        </button>
        <button type="button" className="hud-btn" onClick={exportTxt}>
          {t("export_txt")}
        </button>
      </div>

      <div className="cargo-middle">
        <aside className="inst-panel cargo-editor-panel">
          <h3>{t("text_label")}</h3>
          <textarea
            className="cargo-editor"
            value={raw}
            readOnly={readonly}
            spellCheck={false}
            placeholder={t("paste_text")}
            onChange={(e) => setRaw(e.target.value)}
          />
        </aside>

        <aside className="inst-panel cargo-side tone-amber">
          <h3>{t("text_processing")}</h3>
          <ul className="cargo-opts">
            {OPTS.map((o) => {
              const on = opts[o.key];
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    className={`hud-btn cargo-opt-btn ${on ? "on" : ""}`}
                    onClick={() => toggleOpt(o.key)}
                  >
                    {on ? `● ${t("opt_on")}` : `○ ${t("opt_off")}`}
                  </button>
                  <div>
                    <strong>{t(o.titleKey)}</strong>
                    <p className="muted">{t(o.descKey)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" className="hud-btn amber cargo-apply" onClick={() => void applyToField()}>
            ✦ {t("apply_to_field")}
          </button>
          <div className="cargo-preview-block">
            <div className="lab">{t("trainer_preview")}</div>
            <div className="cargo-preview-meta">{previewInfo}</div>
            {glueRes && glueRes.count > 0 ? (
              <div className="cargo-preview-meta muted" data-testid="cargo-glue">
                {t("glue_fixed_n").replace("{0}", fmtInt(glueRes.count))}: {glueRes.examples.slice(0, 4).join(", ")}
              </div>
            ) : null}
            <pre className="cargo-preview">{adapted ? adapted.slice(0, 260) + (adapted.length > 260 ? "…" : "") : t("cargo_preview_hint")}</pre>
          </div>
        </aside>
      </div>

      <footer className="cargo-foot">
        <span className="muted cargo-status">{status}</span>
        <div className="cargo-foot-actions">
          <button type="button" className="hud-btn" onClick={() => void saveBoard(false)}>
            {t("save_aboard")}
          </button>
          <button
            type="button"
            className="hud-btn"
            style={{
              color: sameBoard ? "var(--st-ok)" : undefined,
              borderColor: sameBoard ? "color-mix(in srgb, var(--st-ok) 55%, var(--st-line))" : undefined,
              opacity: sameBoard ? 1 : 0.45,
            }}
            disabled={!sameBoard}
            onClick={() => void saveBoard(true, board?.index ?? 0)}
          >
            {sameBoard ? t("resume_pct").replace("{0}", String(progressPct)) : t("resume_place")}
          </button>
          <button type="button" className="hud-btn amber" onClick={() => void saveBoard(true, 0)}>
            ▶ {t("board_and_start")}
          </button>
        </div>
      </footer>
    </section>
  );
}
