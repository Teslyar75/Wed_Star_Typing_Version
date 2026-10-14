/** ЗВЁЗДНЫЕ КАРТЫ — порт stamina/english/pages_main.SetsPage + ui.Tile (186×112, 6×4). */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import type { EnWord } from "./types";

type SetInfo = { id: string; code: string; name: string; sub: string; limit: number; total: number; known: number };

type Props = {
  currentSet?: string;
  onOpenScanner: (word: string) => void;
  onStartMission: (setId: string) => void;
  onLearnCards: (setId: string) => void;
  onSetChange?: (setId: string) => void;
};

const PAGE_SIZE = 24; // COLS×ROWS = 6×4

const POS_SHORT: Record<string, string> = {
  noun: "NOUN",
  verb: "VERB",
  adjective: "ADJ",
  adverb: "ADVERB",
  pronoun: "PRONOUN",
  preposition: "PREP",
  conjunction: "CONJ",
  interjection: "INTERJ",
  determiner: "DET",
};

const DIFF_RU: Record<string, string> = {
  easy: "ЛЁГКОЕ",
  medium: "СРЕДНЕЕ",
  tricky: "ТРУДНОЕ",
};

const STATUS_OPTS = [
  ["all", "en_all"],
  ["known", "en_status_known"],
  ["unknown", "en_status_unknown"],
  ["review", "en_status_review"],
] as const;

const LEN_OPTS = [
  ["all", "en_all"],
  ["short", "en_len_short"],
  ["mid", "en_len_mid"],
  ["long", "en_len_long"],
] as const;

const DIFF_OPTS = [
  ["all", "en_all"],
  ["easy", "en_diff_easy"],
  ["medium", "en_diff_mid"],
  ["tricky", "en_diff_hard"],
] as const;

const SORT_OPTS = [
  ["random", "en_sort_random"],
  ["freq", "en_sort_freq"],
  ["alpha", "en_sort_alpha"],
  ["difficulty", "en_sort_diff"],
] as const;

const POS_OPTS = [
  ["", "en_all"],
  ["noun", "en_pos_noun"],
  ["verb", "en_pos_verb"],
  ["adjective", "en_pos_adj"],
  ["adverb", "en_pos_adv"],
  ["pronoun", "en_pos_pron"],
  ["preposition", "en_pos_prep"],
  ["conjunction", "en_pos_conj"],
  ["other", "en_pos_other"],
] as const;

export default function StarMapsPage({
  currentSet = "top-3000",
  onOpenScanner,
  onStartMission,
  onLearnCards,
  onSetChange,
}: Props) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [setId, setSetId] = useState(currentSet);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("");
  const [status, setStatus] = useState("all");
  const [length, setLength] = useState("all");
  const [diff, setDiff] = useState("all");
  const [sort, setSort] = useState("random");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000) + 1);
  const [items, setItems] = useState<EnWord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setSetId(currentSet);
  }, [currentSet]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/english/sets", { credentials: "include" });
      if (r.ok) setSets(await r.json());
    })();
  }, []);

  const pickSet = (id: string) => {
    setSetId(id);
    setPage(0);
    onSetChange?.(id);
  };

  const resetFilters = () => {
    setQ("");
    setStatus("all");
    setLength("all");
    setPos("");
    setDiff("all");
    setSort("random");
    setSeed(Math.floor(Math.random() * 1_000_000) + 1);
    setPage(0);
  };

  const shuffle = () => {
    setSort("random");
    setSeed(Math.floor(Math.random() * 1_000_000) + 1);
    setPage(0);
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        status,
        length,
        sort,
        seed: String(seed),
      });
      if (q.trim()) params.set("q", q.trim());
      if (pos) params.set("pos", pos);
      if (diff !== "all") params.set("difficulty", diff);
      const r = await fetch(`/api/english/set/${encodeURIComponent(setId)}?${params}`, { credentials: "include" });
      if (!r.ok) return;
      const j = (await r.json()) as { items: EnWord[]; total: number };
      setItems(j.items || []);
      setTotal(j.total || 0);
    } finally {
      setBusy(false);
    }
  }, [setId, q, pos, status, length, diff, sort, seed, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const markKnown = async (w: EnWord) => {
    await fetch("/api/english/known", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id, known: !w.known }),
    });
    void load();
  };

  const toList = async (w: EnWord) => {
    const lists = await (await fetch("/api/english/lists", { credentials: "include" })).json();
    const fav = Array.isArray(lists) ? lists.find((x: { kind: string }) => x.kind === "favorite") || lists[0] : null;
    if (!fav) return;
    await fetch(`/api/english/lists/${fav.id}/words`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: w.id }),
    });
  };

  const cur = sets.find((s) => s.id === setId);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const known = cur?.known ?? 0;
  const setTotalN = cur?.total ?? 0;
  const pct = Math.round((known / Math.max(1, setTotalN)) * 100);

  const chip = (key: string, active: boolean, label: string, onClick: () => void) => (
    <button key={key} type="button" className={`en-sm-chip ${active ? "on" : ""}`} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <section className="en-starmaps">
      {/* Strip — как ui.Strip */}
      <header className="en-sm-strip">
        <div className="en-sm-strip-bar" aria-hidden />
        <div className="en-sm-strip-main">
          <h2 className="en-sm-title">
            {t("en_sector_map")
              .replace("{0}", cur?.code || "S")
              .replace("{1}", (cur?.name || setId).toUpperCase())}
          </h2>
          <p className="en-sm-hint">{t("en_starmaps_hint")}</p>
        </div>
        <div className="en-sm-prog">
          <div className="en-sm-prog-lab">
            <span>{t("en_route_progress")}</span>
            <span className="mono">
              {known} / {setTotalN} · {pct}%
            </span>
          </div>
          <div className="en-sm-prog-bar">
            <div style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      </header>

      {/* ПАРАМЕТРЫ — 3 ряда как SetsPage */}
      <div className="en-sm-params">
        <div className="en-sm-params-title">{t("en_scan_params")}</div>
        <div className="en-sm-row">
          {sets.map((s) => chip(s.id, setId === s.id, s.code, () => pickSet(s.id)))}
          <span className="en-sm-lab">{t("en_search_word")}</span>
          <input
            className="en-sm-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            aria-label={t("en_search_word")}
          />
          <span className="en-sm-found mono">
            {t("en_found").replace("{0}", String(total))}
            {busy ? "…" : ""}
          </span>
          <button type="button" className="en-sm-chip danger" onClick={resetFilters}>
            ✕ {t("en_reset_filters")}
          </button>
          <button type="button" className="en-sm-chip" onClick={shuffle}>
            ⤨ {t("en_shuffle")}
          </button>
        </div>
        <div className="en-sm-row">
          <span className="en-sm-lab">{t("en_filter_status")}</span>
          {STATUS_OPTS.map(([k, lab]) =>
            chip(k, status === k, t(lab), () => {
              setStatus(k);
              setPage(0);
            }),
          )}
          <span className="en-sm-lab">{t("en_filter_len")}</span>
          {LEN_OPTS.map(([k, lab]) =>
            chip(`len-${k}`, length === k, t(lab), () => {
              setLength(k);
              setPage(0);
            }),
          )}
          <span className="en-sm-lab">{t("en_filter_diff")}</span>
          {DIFF_OPTS.map(([k, lab]) =>
            chip(`diff-${k}`, diff === k, t(lab), () => {
              setDiff(k);
              setPage(0);
            }),
          )}
        </div>
        <div className="en-sm-row">
          <span className="en-sm-lab">{t("en_filter_sort")}</span>
          {SORT_OPTS.map(([k, lab]) =>
            chip(`sort-${k}`, sort === k, t(lab), () => {
              setSort(k);
              setPage(0);
            }),
          )}
          <span className="en-sm-lab">{t("en_filter_pos")}</span>
          {POS_OPTS.map(([k, lab]) =>
            chip(`pos-${k || "all"}`, pos === k, t(lab), () => {
              setPos(k);
              setPage(0);
            }),
          )}
        </div>
      </div>

      {/* Сетка 6×4 — ui.Tile */}
      <div className="en-sm-grid">
        {items.map((w) => {
          const isFlip = !!flipped[w.id];
          const d = (w.difficulty || "medium").toLowerCase();
          const posLabel = POS_SHORT[(w.pos || "").toLowerCase()] || (w.pos || "?").toUpperCase();
          const diffLabel = DIFF_RU[d] || d;
          const back =
            (w.translation ? `${w.translation}${w.definition ? " — " : ""}` : "") + (w.definition || "") || "—";
          return (
            <article key={w.id} className={`en-sm-tile ${w.known ? "known" : ""}`}>
              <button type="button" className="en-sm-tile-body" onClick={() => onOpenScanner(w.word)}>
                <span className="en-sm-rank mono">#{w.rank || w.id}</span>
                <span
                  className="en-sm-flip"
                  role="presentation"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlipped((f) => ({ ...f, [w.id]: !f[w.id] }));
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
                      <span className={`en-sm-tag diff-${d}`}>{diffLabel}</span>
                    </div>
                  </>
                )}
              </button>
              <div className="en-sm-tile-foot">
                <button
                  type="button"
                  className={`en-sm-act ${w.known ? "ok" : ""}`}
                  onClick={() => void markKnown(w)}
                >
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
          <button type="button" className="en-sm-chip" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            ◀
          </button>
          <span className="mono">
            {t("en_page").replace("{0}", String(page + 1)).replace("{1}", String(pages))}
          </span>
          <button
            type="button"
            className="en-sm-chip"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            ▶
          </button>
        </div>
        <p className="en-sm-tip">{t("en_board_tip")}</p>
        <div className="en-sm-cta">
          <button type="button" className="en-sm-cta-btn amber" onClick={() => onLearnCards(setId)}>
            {t("en_learn_cards")}
          </button>
          <button type="button" className="en-sm-cta-btn" onClick={() => onStartMission(setId)}>
            {t("en_mission_set")}
          </button>
        </div>
      </footer>
    </section>
  );
}
