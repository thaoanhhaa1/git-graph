import { create } from 'zustand';
import type { SubmoduleInfo } from '@git-graph/shared';
import { requestSubmoduleList } from '../messaging/messageRouter';

export interface SubmoduleStoreState {
  repositoryId: string | null;
  submodules: SubmoduleInfo[];
  isLoading: boolean;
  error: string | null;
}

export interface SubmoduleStoreActions {
  requestSubmodules: (repositoryId: string) => void;
  receiveSubmodules: (repositoryId: string, submodules: SubmoduleInfo[]) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type SubmoduleStore = SubmoduleStoreState & SubmoduleStoreActions;

export const useSubmoduleStore = create<SubmoduleStore>((set, get) => ({
  repositoryId: null,
  submodules: [],
  isLoading: false,
  error: null,

  requestSubmodules: (repositoryId: string) => {
    set({
      repositoryId,
      isLoading: get().repositoryId !== repositoryId || get().submodules.length === 0,
      error: null,
    });
    requestSubmoduleList(repositoryId);
  },

  receiveSubmodules: (repositoryId: string, submodules: SubmoduleInfo[]) => {
    set({
      repositoryId,
      submodules,
      isLoading: false,
      error: null,
    });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  reset: () => {
    set({
      repositoryId: null,
      submodules: [],
      isLoading: false,
      error: null,
    });
  },
}));
