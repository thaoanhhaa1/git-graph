import { create } from 'zustand';
import { DEFAULT_PAGE_SIZE, clampPageSize, type CommitOrdering } from '@git-graph/shared';
import { loadPersistedState, savePersistedState } from './persistence';

export type DateType = 'default' | 'relative' | 'absolute';

export const DEFAULT_BLAME_FORMAT = '${author}, ${relativeDate} • ${subject}';

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
  showMinimap: boolean;
  showStatusBarItem: boolean;
  blameEnabled: boolean;
  blameFormat: string;
}

export interface ConfigStoreState {
  config: ViewConfig;
  /** Incremented whenever persisted column widths should be discarded. */
  columnWidthsResetToken: number;
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
  setShowMinimap: (show: boolean) => void;
  setShowStatusBarItem: (show: boolean) => void;
  setBlameEnabled: (enabled: boolean) => void;
  setBlameFormat: (format: string) => void;
  updateConfig: (partial: Partial<ViewConfig>) => void;
  resetConfig: () => void;
  resetColumnWidths: () => void;
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
  showMinimap: true,
  showStatusBarItem: true,
  blameEnabled: false,
  blameFormat: DEFAULT_BLAME_FORMAT,
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
  columnWidthsResetToken: 0,

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

  setShowMinimap: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showMinimap: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setShowStatusBarItem: (show: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, showStatusBarItem: show };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setBlameEnabled: (enabled: boolean) => {
    set((state) => {
      const nextConfig = { ...state.config, blameEnabled: enabled };
      savePersistedState({ viewConfig: nextConfig });
      return { config: nextConfig };
    });
  },

  setBlameFormat: (format: string) => {
    set((state) => {
      const nextConfig = { ...state.config, blameFormat: format };
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

  resetColumnWidths: () => {
    set((state) => {
      savePersistedState({ columnWidths: undefined });
      return { columnWidthsResetToken: state.columnWidthsResetToken + 1 };
    });
  },
}));
