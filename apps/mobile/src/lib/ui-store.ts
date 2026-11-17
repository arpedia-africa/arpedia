import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemeName } from '@arpedia/ui';

// Small UI state only (CLAUDE.md). The theme is kept on the device first so it applies offline;
// flow 01 syncs it to profiles.theme.
interface UiState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

export const useUi = create<UiState>()(
  persist(set => ({ theme: 'sunflower', setTheme: theme => set({ theme }) }), {
    name: 'arpedia.ui',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);
