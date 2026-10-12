import { create } from "zustand";

/** Единая позиция чтения/набора: textId + sentence_id (WEB_PLAN §3). */
type PosState = {
  textId: number | null;
  sentenceId: number;
  setText: (textId: number | null) => void;
  setSentence: (sentenceId: number) => void;
  jump: (textId: number, sentenceId: number) => void;
};

export const useReadingPos = create<PosState>((set) => ({
  textId: null,
  sentenceId: 0,
  setText: (textId) => set({ textId }),
  setSentence: (sentenceId) => set({ sentenceId }),
  jump: (textId, sentenceId) => set({ textId, sentenceId }),
}));
