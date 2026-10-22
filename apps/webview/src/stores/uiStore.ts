import { create } from 'zustand';
import type { WebviewDialogKind } from '@git-graph/shared';

export interface UiStoreState {
  requestedDialog: WebviewDialogKind | null;
}

export interface UiStoreActions {
  requestDialog: (dialog: WebviewDialogKind) => void;
  clearRequestedDialog: () => void;
}

export type UiStore = UiStoreState & UiStoreActions;

export const useUiStore = create<UiStore>((set) => ({
  requestedDialog: null,
  requestDialog: (dialog) => set({ requestedDialog: dialog }),
  clearRequestedDialog: () => set({ requestedDialog: null }),
}));
