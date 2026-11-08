import { useState } from "react";
import { t } from "../i18n";
import CefrPage from "./CefrPage";
import FromBookPage from "./FromBookPage";
import StarMapsPage from "./StarMapsPage";
import VerbsPage from "./VerbsPage";

type HubTab = "std" | "cefr" | "verbs" | "book";

type Props = {
  initialTab?: HubTab;
  currentSet?: string;
  onOpenScanner: (word: string) => void;
  onStartMission: (setId: string) => void;
  onLearnCards: (setId: string) => void;
  onSetChange?: (setId: string) => void;
  onDuck?: (on: boolean) => void;
  ttsRate?: number;
  onPracticeBook: () => void;
};

const TABS: { id: HubTab; label: string; hint: string }[] = [
  { id: "std", label: "en_sets_std", hint: "en_sets_std_hint" },
  { id: "cefr", label: "en_sets_cefr", hint: "en_sets_cefr_hint" },
  { id: "verbs", label: "en_sets_verbs", hint: "en_sets_verbs_hint" },
  { id: "book", label: "en_sets_book", hint: "en_sets_book_hint" },
];

export default function SetsHubPage({
  initialTab = "std",
  currentSet,
  onOpenScanner,
  onStartMission,
  onLearnCards,
  onSetChange,
  onDuck,
  ttsRate = 1,
  onPracticeBook,
}: Props) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  return (
    <section className="en-setshub">
      <div className="en-setshub-tabs">
        {TABS.map((tb) => (
          <button key={tb.id} type="button" className={"en-sm-chip" + (tab === tb.id ? " on" : "")} onClick={() => setTab(tb.id)}>
            {t(tb.label)}
          </button>
        ))}
        <span className="muted en-setshub-hint">{t(TABS.find((x) => x.id === tab)?.hint || "")}</span>
      </div>
      {tab === "std" ? (
        <StarMapsPage
          currentSet={currentSet}
          onOpenScanner={onOpenScanner}
          onStartMission={onStartMission}
          onLearnCards={onLearnCards}
          onSetChange={onSetChange}
        />
      ) : null}
      {tab === "cefr" ? (
        <CefrPage
          onOpenScanner={onOpenScanner}
          onStartMission={(lv) => onStartMission("cefr-" + lv.toLowerCase().replace(".", "-"))}
          onLearnCards={onLearnCards}
        />
      ) : null}
      {tab === "verbs" ? <VerbsPage onDuck={onDuck} ttsRate={ttsRate} /> : null}
      {tab === "book" ? <FromBookPage onPractice={onPracticeBook} /> : null}
    </section>
  );
}
