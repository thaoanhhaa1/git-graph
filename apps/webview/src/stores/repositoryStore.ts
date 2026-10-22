import { create } from 'zustand';
import type { RepositoryItem, RepositorySyncStatus } from '@git-graph/shared';
import { loadPersistedState, savePersistedState } from './persistence';

export interface RepositoryStoreState {
  repositories: RepositoryItem[];
  activeRepositoryId: string | null;
  hasBootstrapped: boolean;
  isLoading: boolean;
  error: string | null;
  syncStatus: RepositorySyncStatus | null;
}

export interface RepositoryStoreActions {
  setRepositories: (
    repositories: RepositoryItem[],
    preferredActiveId?: string,
    isBootstrap?: boolean,
  ) => void;
  setActiveRepositoryId: (id: string | null) => void;
  setBootstrapped: (hasBootstrapped: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setSyncStatus: (status: RepositorySyncStatus | null) => void;
  getActiveRepository: () => RepositoryItem | undefined;
  reset: () => void;
}

export type RepositoryStore = RepositoryStoreState & RepositoryStoreActions;

const initialPersistedState = loadPersistedState();

export const useRepositoryStore = create<RepositoryStore>((set, get) => ({
  repositories: [],
  activeRepositoryId: initialPersistedState?.activeRepositoryId ?? null,
  hasBootstrapped: false,
  isLoading: false,
  error: null,
  syncStatus: null,

  setRepositories: (
    repositories: RepositoryItem[],
    preferredActiveId?: string,
    isBootstrap?: boolean,
  ) => {
    set((state) => {
      let resolvedActiveId: string | null = null;

      if (preferredActiveId && repositories.some((r) => r.id === preferredActiveId)) {
        resolvedActiveId = preferredActiveId;
      } else if (
        state.activeRepositoryId &&
        repositories.some((r) => r.id === state.activeRepositoryId)
      ) {
        resolvedActiveId = state.activeRepositoryId;
      } else if (repositories.length > 0) {
        resolvedActiveId = repositories[0]?.id ?? null;
      } else {
        resolvedActiveId = null;
      }

      savePersistedState({ activeRepositoryId: resolvedActiveId });

      return {
        repositories,
        activeRepositoryId: resolvedActiveId,
        hasBootstrapped: isBootstrap !== undefined ? isBootstrap : state.hasBootstrapped,
        isLoading: false,
        error: null,
        syncStatus: null,
      };
    });
  },

  setActiveRepositoryId: (id: string | null) => {
    set((state) => {
      if (state.activeRepositoryId === id) {
        return state;
      }
      savePersistedState({ activeRepositoryId: id });
      return { activeRepositoryId: id };
    });
  },

  setBootstrapped: (hasBootstrapped: boolean) => set({ hasBootstrapped }),

  setLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => set({ error, isLoading: false }),

  setSyncStatus: (status) => set({ syncStatus: status }),

  getActiveRepository: () => {
    const { repositories, activeRepositoryId } = get();
    if (!activeRepositoryId) {
      return repositories[0];
    }
    return repositories.find((r) => r.id === activeRepositoryId) ?? repositories[0];
  },

  reset: () => {
    set({
      repositories: [],
      activeRepositoryId: null,
      hasBootstrapped: false,
      isLoading: false,
      error: null,
      syncStatus: null,
    });
  },
}));
