/** CEFR — те же плитки 6x4, что СТАНДАРТ; грузим порцию 24, не весь уровень. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";

type Level = {
  id: string;
  title: string;
  total: number;
  known: number;
  pct: number;
  unlocked: boolean;
  ready?: boolean;
};

type CefrWord = {
  id: number;
  word: string;
  slug: string;
  pos: string;
  ru: string;
  translation?: string;
  ipa: string;
  definition: string;
  difficulty: string;
  rank: number;
  known: boolean;
};

type Props = {
  onOpenScanner: (word: string) => void;
  onStartMission: (level: string) => void;
  onLearnCards?: (level: string) => void;
};

const POS_SHORT: Record<string, string> = {
  noun: "NOUN",
  n: "NOUN",
  verb: "VERB",
  v: "VERB",
  adjective: "ADJ",
  adj: "ADJ",
  adverb: "ADVERB",
  adv: "ADVERB",
  pronoun: "PRONOUN",
  preposition: "PREP",
  prep: "PREP",
  conjunction: "CONJ",
  interjection: "INTERJ",
  determiner: "DET",
};

const DIFF_RU: Record<string, string> = {
  easy: "ЛЁГКОЕ",
  medium: "СРЕДНЕЕ",
  tricky: "ТРУДНОЕ",
};

const FALLBACK_LV = ["A1", "A2", "B1.1", "B1.2", "B2.1", "B2.2", "C1", "C2"];

async function ensureId(w: CefrWord): Promise<number> {
  if (w.id) return w.id;
  const r = await fetch("/api/english/ensure-word", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      word: w.word,
      slug: w.slug,
      pos: w.pos,
      translation: w.ru || w.translation || "",
      definition: w.definition,
      ipa: w.ipa,
      difficulty: w.difficulty,
    }),
  });
  if (!r.ok) return 0;
  const j = (await r.json()) as { id?: number };
  return j.id || 0;
}

export default function CefrPage({ onOpenScanner, onStartMission, onLearnCards }: Props) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState("A1");
  const [title, setTitle] = useState("A1");
  const [block, setBlock] = useState(0);
  const [blocks, setBlocks] = useState(1);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [words, setWords] = useState<CefrWord[]>([]);
  const [hint, setHint] = useState("");
  const [unlocked, setUnlocked] = useState(true);
  const [knownN, setKnownN] = useState(0);
  const [totalN, setTotalN] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const loadLevels = useCallback(async () => {
    const r = await fetch("/api/english/cefr/levels", { credentials: "include" });
    const j = (await r.json()) as { levels?: Level[] };
    setLevels(j.levels || []);
  }, []);

  const loadPage = useCallback(async (lv: string, b: number, p: number) => {
    setBusy(true);
    try {
      const r = await fetch(
        "/api/english/cefr/" + encodeURIComponent(lv) + "?block=" + b + "&page=" + p + "&page_size=24",
        { credentials: "include" },
      );
      const j = await r.json();
      setUnlocked(j.unlocked !== false);
      setHint(j.hint || "");
      setBlocks(Math.max(1, j.blocks || 1));
      setBlock(j.block || 0);
      setPages(Math.max(1, j.pages || 1));
      setPage(j.page || 0);
      setWords(j.words || []);
      setTitle(j.title || lv);
      setTotalN(j.total || 0);
      setKnownN(j.known || 0);
      setFlipped({});
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  useEffect(() => {
    void loadPage(level, 0, 0);
  }, [level, loadPage]);

  const markKnown = async (w: CefrWord) => {
    const id = await ensureId(w);
    if (!id) return;
    await fetch("/api/english/known", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: id, known: !w.known }),
    });
    setWords((rows) => rows.map((x) => (x.slug === w.slug ? { ...x, id, known: !w.known } : x)));
  };

  const toList = async (w: CefrWord) => {
    const id = await ensureId(w);
    if (!id) return;
    const lists = await (await fetch("/api/english/lists", { credentials: "include" })).json();
    const fav = Array.isArray(lists) ? lists.find((x: { kind: string }) => x.kind === "favorite") || lists[0] : null;
    if (!fav) return;
    await fetch("/api/english/lists/" + fav.id + "/words", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: id }),
    });
  };

  const chipLv = levels.length
    ? levels
    : FALLBACK_LV.map((id) => ({
        id,
        title: id,
        total: 0,
        known: 0,
        pct: 0,
        unlocked: id === "A1",
      }));
  const pct = Math.round((knownN / Math.max(1, totalN)) * 100);
  const setKey = "cefr-" + level.toLowerCase().replace(".", "-");

  return (
    <section className="en-starmaps en-cefr">
      <header className="en-sm-strip">
        <div className="en-sm-strip-bar" aria-hidden />
        <div className="en-sm-strip-main">
          <h2 className="en-sm-title">CEFR · {title}</h2>
          <p className="en-sm-hint">{t("en_starmaps_hint")}</p>
        </div>
        <div className="en-sm-prog">
          <div className="en-sm-prog-lab">
            <span>{t("en_route_progress")}</span>
            <span className="mono">
              {knownN} / {totalN || "—"} · {pct}%
            </span>
          </div>
          <div className="en-sm-prog-bar">
            <div style={{ width: Math.min(100, pct) + "%" }} />
          </div>
        </div>
      </header>

      <div className="en-sm-params">
        <div className="en-sm-row">
          {chipLv.map((lv) => (
            <button
              key={lv.id}
              type="button"
              className={"en-sm-chip" + (lv.id === level ? " on" : "") + (lv.unlocked ? "" : " locked")}
              disabled={!lv.unlocked}
              onClick={() => {
                setLevel(lv.id);
                setBlock(0);
                setPage(0);
              }}
              title={lv.total ? lv.known + "/" + lv.total : lv.title}
            >
              {lv.id}
              {lv.total ? <span className="muted"> {lv.known}/{lv.total}</span> : null}
            </button>
          ))}
        </div>
        {unlocked && blocks > 1 ? (
          <div className="en-sm-row">
            <span className="en-sm-lab">
              {t("en_cefr_block").replace("{0}", String(block + 1)).replace("{1}", String(blocks))}
            </span>
            {Array.from({ length: blocks }, (_, i) => (
              <button
                key={i}
                type="button"
                className={"en-sm-chip" + (i === block ? " on" : "")}
                onClick={() => void loadPage(level, i, 0)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!unlocked ? (
        <p className="muted">{hint || t("en_cefr_locked").replace("{0}", level).replace("{1}", "80")}</p>
      ) : (
        <>
          <div className="en-sm-grid" aria-busy={busy}>
            {words.map((w) => {
              const d = (w.difficulty || "medium").toLowerCase();
              const posLabel = POS_SHORT[(w.pos || "").toLowerCase()] || (w.pos || "?").toUpperCase();
              const diffLabel = DIFF_RU[d] || d;
              const isFlip = !!flipped[w.slug];
              const back =
                (w.ru || w.translation ? (w.ru || w.translation) + (w.definition ? " — " : "") : "") +
                  (w.definition || "") || "—";
              return (
                <article key={w.slug} className={"en-sm-tile" + (w.known ? " known" : "")}>
                  <button type="button" className="en-sm-tile-body" onClick={() => onOpenScanner(w.word)}>
                    <span className="en-sm-rank mono">#{w.rank || w.id || "—"}</span>
                    <span
                      className="en-sm-flip"
                      role="presentation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFlipped((f) => ({ ...f, [w.slug]: !f[w.slug] }));
                      }}
                    >
                      ⟳
                    </span>
                    {isFlip ? (
                      <p className="en-sm-def">{back}</p>
                    ) : (
                      <>
                        <strong className="en-sm-word">{w.word}</strong>
                        <div className="en-sm-tags">
                          <span className="en-sm-tag">{posLabel}</span>
                          <span className={"en-sm-tag diff-" + d}>{diffLabel}</span>
                        </div>
                      </>
                    )}
                  </button>
                  <div className="en-sm-tile-foot">
                    <button type="button" className={"en-sm-act" + (w.known ? " ok" : "")} onClick={() => void markKnown(w)}>
                      {w.known ? "✓ ЗНАЮ" : "✓ знаю"}
                    </button>
                    <button type="button" className="en-sm-act list" onClick={() => void toList(w)}>
                      ⊞ в отсек
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="en-sm-foot">
            <div className="en-sm-pager">
              <button
                type="button"
                className="en-sm-chip"
                disabled={page <= 0 && block <= 0}
                onClick={() => {
                  if (page > 0) void loadPage(level, block, page - 1);
                  else if (block > 0) void loadPage(level, block - 1, 0);
                }}
              >
                ◀
              </button>
              <span className="mono">
                {t("en_page").replace("{0}", String(page + 1)).replace("{1}", String(pages))}
              </span>
              <button
                type="button"
                className="en-sm-chip"
                disabled={page + 1 >= pages && block + 1 >= blocks}
                onClick={() => {
                  if (page + 1 < pages) void loadPage(level, block, page + 1);
                  else if (block + 1 < blocks) void loadPage(level, block + 1, 0);
                }}
              >
                ▶
              </button>
            </div>
            <p className="en-sm-tip">{t("en_board_tip")}</p>
            <div className="en-sm-cta">
              <button type="button" className="en-sm-cta-btn amber" onClick={() => onLearnCards?.(setKey)}>
                {t("en_learn_cards")}
              </button>
              <button type="button" className="en-sm-cta-btn" onClick={() => onStartMission(level)}>
                {t("en_mission_set")}
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
