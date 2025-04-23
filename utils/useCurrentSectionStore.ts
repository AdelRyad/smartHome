// store/useCurrentSectionStore.ts
import {create} from 'zustand';

interface CurrentSectionState {
  currentSectionId: number | null;
  setCurrentSectionId: (sectionId: number | null) => void;
}

export const useCurrentSectionStore = create<CurrentSectionState>(set => ({
  currentSectionId: null,
  setCurrentSectionId: sectionId => set({currentSectionId: sectionId}),
}));
