import { create } from 'zustand';
import type { GitRef } from '@git-graph/shared';
import { loadPersistedState, savePersistedState } from './persistence';

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  commitSha: string;
  commitMessage?: string;
  parents?: string[];
  body?: string;
  refs?: GitRef[];
  targetRef?: GitRef;
}

export interface SelectionStoreState {
  selectedCommitSha: string | null;
  secondarySelectedCommitSha: string | null;
  isDetailPanelOpen: boolean;
  contextMenu: ContextMenuState | null;
}

export interface SelectionStoreActions {
  selectCommit: (sha: string | null) => void;
  selectSecondaryCommit: (sha: string | null) => void;
  clearSelection: () => void;
  setDetailPanelOpen: (isOpen: boolean) => void;
  openContextMenu: (params: {
    x: number;
    y: number;
    commitSha: string;
    commitMessage?: string;
    parents?: string[];
    body?: string;
    refs?: GitRef[];
    targetRef?: GitRef;
  }) => void;
  closeContextMenu: () => void;
  reset: () => void;
}

export type SelectionStore = SelectionStoreState & SelectionStoreActions;

const initialPersistedState = loadPersistedState();

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedCommitSha: initialPersistedState?.selectedCommitSha ?? null,
  secondarySelectedCommitSha: null,
  isDetailPanelOpen: false,
  contextMenu: null,

  selectCommit: (sha: string | null) => {
    set({ selectedCommitSha: sha });
    savePersistedState({ selectedCommitSha: sha });
  },

  selectSecondaryCommit: (sha: string | null) => {
    set({ secondarySelectedCommitSha: sha });
  },

  clearSelection: () => {
    set({ selectedCommitSha: null, secondarySelectedCommitSha: null });
    savePersistedState({ selectedCommitSha: null });
  },

  setDetailPanelOpen: (isOpen: boolean) => {
    set({ isDetailPanelOpen: isOpen });
  },

  openContextMenu: (params) => {
    set({
      contextMenu: {
        isOpen: true,
        x: params.x,
        y: params.y,
        commitSha: params.commitSha,
        commitMessage: params.commitMessage,
        ...(params.parents !== undefined ? { parents: params.parents } : {}),
        ...(params.body !== undefined ? { body: params.body } : {}),
        ...(params.refs !== undefined ? { refs: params.refs } : {}),
        ...(params.targetRef !== undefined ? { targetRef: params.targetRef } : {}),
      },
    });
  },

  closeContextMenu: () => {
    set({ contextMenu: null });
  },

  reset: () => {
    set({
      selectedCommitSha: null,
      secondarySelectedCommitSha: null,
      isDetailPanelOpen: false,
      contextMenu: null,
    });
    savePersistedState({ selectedCommitSha: null });
  },
}));
