/** СКАНЕР ОБЪЕКТА — порт stamina/english/pages_main.ScannerPage. */
import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import MatchReadout from "./MatchReadout";
import MicTransmit, { type MatchInfo } from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import type { EnPage, EnWord } from "./types";

type Props = {
  initialQuery?: string;
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  backPage?: EnPage;
  currentSet?: string;
  onBack?: () => void;
  onNeighborWord?: (word: string) => void;
  onStartMission?: (mode: "random" | "speaking" | "reading" | "questions", word: string) => void;
};

const MODES = [
  { id: "random" as const, icon: "⤨", key: "en_m_rnd" },
  { id: "speaking" as const, icon: "🎤", key: "en_m_spk" },
  { id: "reading" as const, icon: "▤", key: "en_m_rdg" },
  { id: "questions" as const, icon: "?", key: "en_m_qst" },
];

const POS_SHORT: Record<string, string> = {
  noun: "NOUN",
  verb: "VERB",
  adjective: "ADJ",
  adverb: "ADVERB",
  pronoun: "PRONOUN",
  preposition: "PREP",
  conjunction: "CONJ",
  determiner: "DET",
  interjection: "INTERJ",
};

const DIFF_RU: Record<string, string> = {
  easy: "ЛЁГКОЕ",
  medium: "СРЕДНЕЕ",
  tricky: "ТРУДНОЕ",
};

function highlightWord(sentence: string, word: string) {
  if (!sentence || !word) return sentence;
  const re = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = sentence.split(re);
  return parts.map((p, i) =>
    p.toLowerCase() === word.toLowerCase() ? (
      <mark key={i} className="en-sc-hl">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function ScannerPage({
  initialQuery = "",
  onDuck,
  ttsRate = 1,
  currentSet = "top-3000",
  onBack,
  onNeighborWord,
  onStartMission,
}: Props) {
  const [q, setQ] = useState(initialQuery);
  const [word, setWord] = useState<EnWord | null>(null);
  const [myTr, setMyTr] = useState("");
  const [msg, setMsg] = useState("");
  const [lists, setLists] = useState<{ id: number; name: string }[]>([]);
  const [neighbors, setNeighbors] = useState<string[]>([]);
  const [si, setSi] = useState(0);
  const [showTr, setShowTr] = useState(false);
  const [hint, setHint] = useState(false);
  const [ptab, setPtab] = useState<"ipa" | "syl" | "guide" | "notes">("ipa");
  const [match, setMatch] = useState<MatchInfo | null>(null);

  const load = useCallback(async (query: string, opts?: { silentEmpty?: boolean; remember?: boolean }) => {
    const needle = query.trim();
    if (!needle) return false;
    setMsg("");
    setShowTr(false);
    setHint(false);
    setSi(0);
    setMatch(null);
    const r = await fetch(`/api/english/lookup?q=${encodeURIComponent(needle)}`, { credentials: "include" });
    if (!r.ok) {
      setWord(null);
      if (!opts?.silentEmpty) setMsg(t("en_word_not_found"));
      return false;
    }
    const w = (await r.json()) as EnWord;
    setWord(w);
    setMyTr(w.my_tr || w.translation || "");
    setQ(w.word);
    // remember только для fallback / явного запроса — не зацикливать scanSeed
    if (opts?.remember) onNeighborWord?.(w.word);
    return true;
  }, [onNeighborWord]);

  /** рабочая зона: last session → слово дня → первое из набора */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seed = initialQuery.trim();
      if (seed) {
        if (!cancelled) await load(seed);
        return;
      }
      try {
        const wod = await fetch("/api/english/word-of-day", { credentials: "include" });
        if (wod.ok) {
          const j = (await wod.json()) as { word?: string };
          if (!cancelled && j.word && (await load(j.word, { silentEmpty: true, remember: true }))) return;
        }
      } catch {
        /* */
      }
      try {
        const r = await fetch(
          `/api/english/set/${encodeURIComponent(currentSet)}?limit=1&offset=0&sort=freq`,
          { credentials: "include" },
        );
        if (r.ok) {
          const j = (await r.json()) as { items?: EnWord[] };
          const first = j.items?.[0]?.word;
          if (!cancelled && first) await load(first, { silentEmpty: true, remember: true });
        }
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialQuery, currentSet, load]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await (await fetch("/api/english/lists", { credentials: "include" })).json();
        if (Array.isArray(rows)) setLists(rows.map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })));
      } catch {
        /* guest */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/english/set/${encodeURIComponent(currentSet)}?limit=120&offset=0&sort=freq`, {
          credentials: "include",
        });
        if (!r.ok) return;
        const j = (await r.json()) as { items: EnWord[] };
        setNeighbors((j.items || []).map((x) => x.word));
      } catch {
        /* ignore */
      }
    })();
  }, [currentSet]);

  const markKnown = async (known: boolean) => {
    if (!word) return;
    await fetch("/api/english/known", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, known, my_tr: myTr }),
    });
    setMsg(known ? t("en_marked_known") : t("en_marked_unknown"));
    void load(word.word);
  };

  const toReview = async () => {
    if (!word) return;
    await fetch("/api/english/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, grade: 2 }),
    });
    setMsg(t("en_added_review"));
  };

  const toList = async (listId: number) => {
    if (!word) return;
    await fetch(`/api/english/lists/${listId}/words`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id }),
    });
    setMsg(t("en_added_list"));
  };

  const saveTr = async () => {
    if (!word) return;
    await fetch("/api/english/known", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, known: !!word.known, my_tr: myTr }),
    });
  };

  const neighbor = (d: number) => {
    if (!word || !neighbors.length) return;
    const i = neighbors.findIndex((w) => w.toLowerCase() === word.word.toLowerCase());
    const next = neighbors[(i < 0 ? 0 : i) + d];
    if (!next) return;
    onNeighborWord?.(next);
    void load(next);
  };

  const sents = word?.sentences?.length
    ? word.sentences
    : word?.example
      ? [{ en: word.example, ru: word.example_ru }]
      : word
        ? [{ en: word.word, ru: word.translation }]
        : [];
  const sent = sents[si % Math.max(1, sents.length)] || { en: "", ru: null };
  const d = (word?.difficulty || "medium").toLowerCase();
  const posLabel = POS_SHORT[(word?.pos || "").toLowerCase()] || (word?.pos || "—").toUpperCase();

  const ipaFmt = (() => {
    const raw = (word?.ipa || "").trim();
    if (!raw) return t("en_no_data");
    return raw.startsWith("/") ? raw : `/${raw}/`;
  })();
  const ptext =
    ptab === "ipa"
      ? ipaFmt
      : ptab === "syl"
        ? word?.respelling || t("en_no_data")
        : ptab === "guide"
          ? word?.guide || t("en_no_data")
          : (word?.notes || []).map((n) => `• ${n}`).join("\n") || t("en_no_data");

  return (
    <section className="en-scanner en-sc">
      <header className="en-sm-strip en-sc-strip">
        <div className="en-sm-strip-bar" aria-hidden />
        <div className="en-sm-strip-main">
          <h2 className="en-sm-title">
            {t("en_scan_object")}
            {word ? ` · ${word.word.toUpperCase()}` : ""}
          </h2>
          {word && (
            <p className="en-sm-hint">
              {t("en_scan_meta")
                .replace("{0}", currentSet)
                .replace("{1}", String(word.rank || "—"))}
            </p>
          )}
        </div>
        <div className="en-sc-nav">
          <button type="button" className="en-sm-chip" onClick={onBack}>
            {t("en_back")}
          </button>
          <button type="button" className="en-sm-chip" onClick={() => neighbor(-1)} disabled={!word}>
            {t("en_prev")}
          </button>
          <button type="button" className="en-sm-chip" onClick={() => neighbor(1)} disabled={!word}>
            {t("en_next")}
          </button>
        </div>
      </header>

      {msg && <p className="en-sc-msg">{msg}</p>}

      {!word ? (
        <form
          className="en-sc-empty"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <input
            className="en-sm-search en-sc-empty-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("en_scan_ph")}
          />
          <button type="submit" className="en-sm-cta-btn amber">
            {t("en_scan")}
          </button>
          <p className="en-sm-hint">{t("en_scanner_hint")}</p>
        </form>
      ) : (
        <div className="en-sc-body">
          {/* верх сжимается / скроллится — канал+match всегда в кадре */}
          <div className="en-sc-upper">
            <div className="en-sc-panel en-sc-window">
              <div className="en-sc-panel-lab">{t("en_scan_window")}</div>
              <span className="en-sc-freq">{t("en_freq")} #{word.rank || "—"}</span>
              <div className="en-sc-word">{word.word}</div>
              <div className="en-sc-meta">
                <span className="en-sm-tag">{posLabel}</span>
                <span className={`en-sm-tag diff-${d}`}>{DIFF_RU[d] || d}</span>
              </div>
              <div className="en-sc-voice">
                <SpeakButton
                  text={word.word}
                  lang="en-US"
                  rate={ttsRate}
                  onDuck={onDuck}
                  className="en-sm-chip"
                  label={`🔊 ${t("voice")}`}
                />
                <SpeakButton
                  text={word.word}
                  lang="en-US"
                  rate={Math.max(0.55, ttsRate * 0.7)}
                  onDuck={onDuck}
                  className="en-sm-chip"
                  label={`🐢 ${t("en_slow")}`}
                />
              </div>
            </div>

            <div className="en-sc-cols">
              <div className="en-sc-panel">
                <div className="en-sc-panel-lab">{t("en_scan_pron")}</div>
                <p className="en-sc-respell">
                  {word.respelling
                    ? `[ ${word.respelling.toUpperCase()} ]`
                    : word.ipa
                      ? word.ipa.trim().startsWith("/")
                        ? word.ipa.trim()
                        : `/${word.ipa.trim()}/`
                      : "—"}
                </p>
                <div className="en-sc-ptabs">
                  {(
                    [
                      ["ipa", "IPA"],
                      ["syl", t("en_syl")],
                      ["guide", t("en_how")],
                      ["notes", t("en_notes")],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={`en-sm-chip ${ptab === k ? "on" : ""}`}
                      onClick={() => setPtab(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <pre className="en-sc-ptext">{ptext}</pre>
              </div>

              <div className="en-sc-panel en-sc-panel-data">
                <div className="en-sc-panel-lab">{t("en_scan_data")}</div>
                <div className="en-sc-data-scroll">
                  {word.definition && <p className="en-sc-def">{word.definition}</p>}
                  {(word.example || word.sentences?.[0]?.en) && (
                    <p className="en-sc-ex">{highlightWord(word.example || word.sentences?.[0]?.en || "", word.word)}</p>
                  )}
                </div>
                <label className="en-sc-tr">
                  <span>{t("en_my_tr")}</span>
                  <input value={myTr} onChange={(e) => setMyTr(e.target.value)} onBlur={() => void saveTr()} />
                </label>
                <div className="en-sc-acts">
                  <button
                    type="button"
                    className={`en-sm-chip ${word.known ? "ok-chip" : ""}`}
                    onClick={() => void markKnown(!word.known)}
                  >
                    {word.known ? t("en_know_btn") : t("en_unknown_btn")}
                  </button>
                  <button
                    type="button"
                    className="en-sm-chip"
                    title={lists[0]?.name || t("en_to_list")}
                    onClick={() => {
                      if (lists[0]) void toList(lists[0].id);
                      else setMsg(t("en_no_lists"));
                    }}
                  >
                    {t("en_to_list")}
                  </button>
                  <button type="button" className="en-sm-chip on" onClick={() => void toReview()}>
                    {t("en_to_review_btn")}
                  </button>
                </div>
              </div>
            </div>

            <div className="en-sc-modes">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="en-sm-chip en-sc-mode"
                  onClick={() => onStartMission?.(m.id, word.word)}
                >
                  {m.icon} {t(m.key)}
                </button>
              ))}
            </div>
          </div>

          {/* КАНАЛ — выше, без обрезки низом; совпадение сразу под предложением */}
          <div className="en-sc-panel en-sc-channel">
            <div className="en-sc-panel-lab">{t("en_channel")}</div>
            <div className="en-sc-chan-grid">
              <div className="en-sc-chan-left">
                <div className="en-sc-snum">
                  {t("en_sent_card")
                    .replace("{0}", String((si % Math.max(1, sents.length)) + 1).padStart(2, "0"))
                    .replace("{1}", String(Math.max(1, sents.length)).padStart(2, "0"))}
                </div>
                <p className="en-sc-sent">{highlightWord(sent.en || "", word.word)}</p>
                {showTr && sent.ru ? <p className="en-sc-sent-ru">{sent.ru}</p> : null}
                {hint ? <p className="en-sc-hint-word">{word.word}</p> : null}
                {/* качество произношения — сразу под фразой, всегда в кадре */}
                {match && (match.listening || match.score != null || match.selfScore || match.heard) ? (
                  <MatchReadout
                    score={match.listening ? null : match.score}
                    heard={match.heard}
                    selfScore={match.selfScore}
                    missed={match.missed}
                    counted={match.counted}
                    total={match.total}
                    listening={!!match.listening}
                  />
                ) : null}
                <div className="en-sc-chan-btns">
                  <button
                    type="button"
                    className="en-sm-chip"
                    onClick={() => {
                      setSi((x) => x - 1);
                      setMatch(null);
                    }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="en-sm-chip"
                    onClick={() => {
                      setSi((x) => x + 1);
                      setMatch(null);
                    }}
                  >
                    ▶
                  </button>
                  <SpeakButton
                    text={sent.en}
                    lang="en-US"
                    rate={ttsRate}
                    onDuck={onDuck}
                    className="en-sm-chip"
                    label={`🔊 ${t("voice")}`}
                  />
                  <SpeakButton
                    text={sent.en}
                    lang="en-US"
                    rate={Math.max(0.55, ttsRate * 0.7)}
                    onDuck={onDuck}
                    className="en-sm-chip"
                    label={`🐢 ${t("en_slow")}`}
                  />
                  <button type="button" className="en-sm-chip" onClick={() => setShowTr((v) => !v)}>
                    {t("en_tr_btn")}
                  </button>
                  <button type="button" className="en-sm-chip on" onClick={() => setHint((v) => !v)}>
                    {t("en_hint_btn")}
                  </button>
                </div>
              </div>
              <div className="en-sc-mic">
                <MicTransmit
                  expected={sent.en}
                  targetWord={word.word}
                  onDuck={onDuck}
                  hideMatch
                  onMatch={setMatch}
                  onResult={(score) => {
                    if (score == null) return;
                    void fetch("/api/english/attempt", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        word_id: word.id,
                        mode: "speaking",
                        score,
                      }),
                    });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
