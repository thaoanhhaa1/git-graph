import { create } from 'zustand';
import type { StashEntry, WorktreeStatus } from '@git-graph/shared';
import { requestStashList, requestWorktreeStatus } from '../messaging/messageRouter';

export interface WorktreeStoreState {
  repositoryId: string | null;
  status: WorktreeStatus | null;
  stashes: StashEntry[];
  isLoading: boolean;
  isLoadingStashes: boolean;
  error: string | null;
}

export interface WorktreeStoreActions {
  requestStatus: (repositoryId: string) => void;
  receiveStatus: (repositoryId: string, status: WorktreeStatus) => void;
  requestStashes: (repositoryId: string) => void;
  receiveStashes: (repositoryId: string, stashes: StashEntry[]) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type WorktreeStore = WorktreeStoreState & WorktreeStoreActions;

export const useWorktreeStore = create<WorktreeStore>((set, get) => ({
  repositoryId: null,
  status: null,
  stashes: [],
  isLoading: false,
  isLoadingStashes: false,
  error: null,

  requestStatus: (repositoryId: string) => {
    set({
      repositoryId,
      isLoading: get().status === null || get().repositoryId !== repositoryId,
      error: null,
    });
    requestWorktreeStatus(repositoryId);
  },

  receiveStatus: (repositoryId: string, status: WorktreeStatus) => {
    set({
      repositoryId,
      status,
      isLoading: false,
      error: null,
    });
  },

  requestStashes: (repositoryId: string) => {
    set({
      repositoryId,
      isLoadingStashes: get().repositoryId !== repositoryId,
    });
    requestStashList(repositoryId);
  },

  receiveStashes: (repositoryId: string, stashes: StashEntry[]) => {
    set({
      repositoryId,
      stashes,
      isLoadingStashes: false,
    });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false, isLoadingStashes: false });
  },

  reset: () => {
    set({
      repositoryId: null,
      status: null,
      stashes: [],
      isLoading: false,
      isLoadingStashes: false,
      error: null,
    });
  },
}));
