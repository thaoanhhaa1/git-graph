import { create } from 'zustand';
import type { RemoteInfo } from '@git-graph/shared';

export interface RemoteStoreState {
  repositoryId: string | null;
  remotes: RemoteInfo[];
  isLoading: boolean;
  error: string | null;
}

export interface RemoteStoreActions {
  startLoading: (repositoryId: string) => void;
  receiveRemotes: (repositoryId: string, remotes: RemoteInfo[]) => void;
  setError: (repositoryId: string, error: string | null) => void;
  reset: () => void;
}

export type RemoteStore = RemoteStoreState & RemoteStoreActions;

export const useRemoteStore = create<RemoteStore>((set, get) => ({
  repositoryId: null,
  remotes: [],
  isLoading: false,
  error: null,

  startLoading: (repositoryId) => {
    const state = get();
    set({
      repositoryId,
      remotes: state.repositoryId === repositoryId ? state.remotes : [],
      isLoading: true,
      error: null,
    });
  },

  receiveRemotes: (repositoryId, remotes) => {
    set((state) => {
      if (state.repositoryId && state.repositoryId !== repositoryId) {
        return state;
      }
      return { repositoryId, remotes, isLoading: false, error: null };
    });
  },

  setError: (repositoryId, error) => {
    set((state) => ({
      repositoryId,
      isLoading: false,
      error: error ?? state.error,
      remotes: state.repositoryId === repositoryId ? state.remotes : [],
    }));
  },

  reset: () =>
    set({
      repositoryId: null,
      remotes: [],
      isLoading: false,
      error: null,
    }),
}));
