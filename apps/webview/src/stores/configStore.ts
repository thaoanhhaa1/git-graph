import { create } from 'zustand';
import { DEFAULT_PAGE_SIZE, clampPageSize, type CommitOrdering } from '@git-graph/shared';
import { loadPersistedState, savePersistedState } from './persistence';

export type DateType = 'default' | 'relative' | 'absolute';

export interface ViewConfig {
  showAuthor: boolean;
  showDate: boolean;
  showRemoteBranches: boolean;
  showTags: boolean;
  dateType: DateType;
  dateTypeExplicit?: boolean;
  pageSize: number;
  commitOrdering: CommitOrdering;
  compactMode: boolean;
}

export interface ConfigStoreState {
  config: ViewConfig;
}

export interface ConfigStoreActions {
  setShowAuthor: (show: boolean) => void;
  setShowDate: (show: boolean) => void;
  setShowRemoteBranches: (show: boolean) => void;
  setShowTags: (show: boolean) => void;
  setDateType: (dateType: DateType) => void;
  setPageSize: (pageSize: number) => void;
  setCommitOrdering: (order: CommitOrdering) => void;
  setCompactMode: (compact: boolean) => void;
  updateConfig: (partial: Partial<ViewConfig>) => void;
  resetConfig: () => void;
}

export type ConfigStore = ConfigStoreState & ConfigStoreActions;

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  showAuthor: true,
  showDate: true,
  showRemoteBranches: true,
  showTags: true,
  dateType: 'default',
  pageSize: DEFAULT_PAGE_SIZE,
  commitOrdering: 'date-order',
  compactMode: false,
};

const initialPersisted = loadPersistedState()?.viewConfig;

export const useConfigStore = create<ConfigStore>((set) => ({
  config: {
    ...DEFAULT_VIEW_CONFIG,
    ...initialPersisted,
    dateType:
      initialPersisted?.dateTypeExplicit && initialPersisted.dateType
        ? initialPersisted.dateType
        : 'default',
    ...(initialPersisted?.pageSize ? { pageSize: clampPageSize(initialPersisted.pageSize) } : {}),
  },

  setShowAuthor: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showAuthor: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setShowDate: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showDate: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setShowRemoteBranches: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showRemoteBranches: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setShowTags: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showTags: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setDateType: (dateType: DateType) => {
    set((state) => {
      const nextConfig = { ...state.config, dateType, dateTypeExplicit: true };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setPageSize: (pageSize: number) => {
    set((state) => {
      const nextConfig = { ...state.config, pageSize: clampPageSize(pageSize) };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setCommitOrdering: (order: CommitOrdering) => {
    set((state) => {
      const nextConfig = { ...state.config, commitOrdering: order };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setCompactMode: (compact: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, compactMode: compact };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  updateConfig: (partial: Partial<ViewConfig>) => {
    set((state) => {
      const nextConfig = {
        ...state.config,
        ...partial,
        ...(partial.pageSize !== undefined ? { pageSize: clampPageSize(partial.pageSize) } : {}),
      };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  resetConfig: () => {
    set(() => {
      savePersistedState({ viewConfig: DEFAULT_VIEW_CONFIG });
      return { config: { ...DEFAULT_VIEW_CONFIG } };
    });
  },
}));
