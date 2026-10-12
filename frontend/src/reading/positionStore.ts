import { create } from "zustand";

/** Единая позиция чтения/набора: textId + sentence_id (WEB_PLAN §3). */
type PosState = {
  textId: number | null;
  sentenceId: number;
  mode: string;
  setText: (textId: number | null) => void;
  setSentence: (sentenceId: number) => void;
  setMode: (mode: string) => void;
  jump: (textId: number, sentenceId: number, mode?: string) => void;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(textId: number, sentenceId: number, mode: string) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void fetch(`/api/library/${textId}/position`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence_id: sentenceId, mode }),
    });
  }, 1000);
}

export const useReadingPos = create<PosState>((set, get) => ({
  textId: null,
  sentenceId: 0,
  mode: "reader",
  setText: (textId) => set({ textId }),
  setSentence: (sentenceId) => {
    set({ sentenceId });
    const { textId, mode } = get();
    if (textId != null) schedulePersist(textId, sentenceId, mode);
  },
  setMode: (mode) => set({ mode }),
  jump: (textId, sentenceId, mode) => {
    const m = mode ?? get().mode;
    set({ textId, sentenceId, mode: m });
    schedulePersist(textId, sentenceId, m);
  },
}));
