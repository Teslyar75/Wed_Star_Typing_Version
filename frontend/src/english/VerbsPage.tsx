import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import MicTransmit from "./MicTransmit";
import SpeakButton from "./SpeakButton";
import { passed, scheduleAdvance } from "./speechStd";

type Verb = {
  lemma: string;
  ru: string;
  v2: string;
  v3: string;
  s: string;
  ing: string;
  ipa: string;
  cefr: string;
};

type TenseRow = {
  key: string;
  tense: string;
  tense_ru: string;
  hint: string;
  en: string;
  ru: string;
};

type Props = { onDuck?: (on: boolean) => void; ttsRate?: number };

export default function VerbsPage({ onDuck, ttsRate = 1 }: Props) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Verb[]>([]);
  const [lemma, setLemma] = useState("");
  const [verb, setVerb] = useState<Verb | null>(null);
  const [tenses, setTenses] = useState<TenseRow[]>([]);
  const [si, setSi] = useState(0);
  const [showTr, setShowTr] = useState(true);
  const siRef = useRef(0);
  const lemmaRef = useRef("");
  siRef.current = si;
  lemmaRef.current = lemma;

  const loadList = useCallback(async (query: string) => {
    const r = await fetch("/api/english/verbs?q=" + encodeURIComponent(query) + "&limit=80", { credentials: "include" });
    const j = (await r.json()) as { items?: Verb[] };
    const items = j.items || [];
    setList(items);
    if (!lemma && items[0]) setLemma(items[0].lemma);
  }, [lemma]);

  const loadVerb = useCallback(async (lm: string) => {
    if (!lm) return;
    const r = await fetch("/api/english/verbs/" + encodeURIComponent(lm), { credentials: "include" });
    if (!r.ok) return;
    const j = (await r.json()) as { verb: Verb; tenses: TenseRow[] };
    setVerb(j.verb);
    setTenses(j.tenses || []);
    setSi(0);
  }, []);

  useEffect(() => { void loadList(q); }, [q, loadList]);
  useEffect(() => { if (lemma) void loadVerb(lemma); }, [lemma, loadVerb]);

  const row = tenses[si];
  return (
    <div className="en-verbs">
      <aside className="en-verbs-list">
        <input className="en-sm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("en_scan_ph")} />
        <div className="en-verbs-scroll">
          {list.map((v) => (
            <button key={v.lemma} type="button" className={"en-verbs-item" + (v.lemma === lemma ? " on" : "")} onClick={() => setLemma(v.lemma)}>
              <b>{v.lemma}</b>
              <span className="muted">{v.ru}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="en-verbs-main">
        {verb ? (
          <>
            <header className="en-verbs-head">
              <div>
                <h3>{verb.lemma} {verb.ipa}</h3>
                <p className="muted">{verb.ru} · {verb.v2} · {verb.v3} · {verb.ing}</p>
              </div>
              <div className="bridge-actions">
                <button type="button" className="en-sm-chip" onClick={() => list.length && setLemma(list[Math.floor(Math.random() * list.length)].lemma)}>{t("en_verbs_random")}</button>
                <button type="button" className={"en-sm-chip" + (showTr ? " on" : "")} onClick={() => setShowTr((x) => !x)}>{t("en_verbs_tr")}</button>
              </div>
            </header>
            <div className="en-verbs-tenses">
              {tenses.map((tn, idx) => (
                <button key={tn.key} type="button" className={"en-verbs-tense" + (idx === si ? " on" : "")} onClick={() => setSi(idx)}>
                  <span className="ens-code">{String(idx + 1).padStart(2, "0")}</span>
                  <b>{tn.tense}</b>
                  <span>{tn.en}</span>
                  {showTr && tn.ru ? <span className="muted">{tn.ru}</span> : null}
                </button>
              ))}
            </div>
            {row ? (
              <div className="en-verbs-check">
                <p className="en-sc-sent">{row.en}</p>
                {showTr && row.ru ? <p className="muted">{row.ru}</p> : null}
                <div className="bridge-actions">
                  <SpeakButton text={row.en} lang="en-US" rate={ttsRate} onDuck={onDuck} className="en-sm-chip" label={"🔊 " + t("voice")} />
                </div>
                <MicTransmit
                  expected={row.en}
                  targetWord={verb.lemma}
                  onDuck={onDuck}
                  onResult={(score) => {
                    if (!passed(score) || tenses.length < 2) return;
                    const hereL = lemma;
                    const hereSi = si;
                    scheduleAdvance(() => setSi((x) => (x + 1) % tenses.length), () => lemmaRef.current === hereL && siRef.current === hereSi);
                  }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">{t("en_cefr_preparing")}</p>
        )}
      </div>
    </div>
  );
}
