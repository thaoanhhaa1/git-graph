import { create } from 'zustand';
import type { Commit, CommitPage, SearchType } from '@git-graph/shared';
import { loadPersistedState, savePersistedState } from './persistence';
import { useRepositoryStore } from './repositoryStore';

export interface GraphStoreState {
  commits: Commit[];
  cursor: string | undefined;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isFetching: boolean;
  error: string | null;
  selectedBranch: string;
  searchTerm: string;
  searchType: SearchType;
  filterAuthor: string;
  filterDateSince: string;
  filterDateUntil: string;
  filterPath: string;
  searchMatches: string[];
  currentMatchIndex: number;
  activeRepoId: string | null;
  currentRequestId: string | null;
  revealCommitSha: string | null;
  generation: number;
}

export interface StartLoadingOptions {
  repositoryId: string;
  isNextPage?: boolean;
  requestId?: string;
  preserveCommits?: boolean;
}

export interface ReceiveCommitsPageOptions {
  repositoryId: string;
  page: CommitPage;
  requestId?: string;
  generation?: number;
  isAppend?: boolean;
  chunkIndex?: number;
  totalChunks?: number;
  isLastChunk?: boolean;
}

export interface StartLoadingResult {
  requestId: string;
  generation: number;
  ignored?: boolean;
}

export interface GraphStoreActions {
  startLoadingPage: (options: StartLoadingOptions) => StartLoadingResult;
  receiveCommitsPage: (options: ReceiveCommitsPageOptions) => boolean;
  setSelectedBranch: (branch: string) => number;
  setSearchTerm: (search: string, options?: { resetCommits?: boolean }) => number;
  setSearchType: (type: SearchType) => void;
  setFilterAuthor: (author: string) => number;
  setFilterDateRange: (since?: string, until?: string) => number;
  setFilterPath: (path: string) => number;
  setSearchMatches: (matches: string[]) => void;
  setCurrentMatchIndex: (index: number) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clearAllFilters: () => number;
  setActiveRepoId: (repoId: string | null) => number;
  setError: (error: string | null, requestId?: string) => void;
  setIsFetching: (isFetching: boolean) => void;
  setRevealCommitSha: (sha: string | null) => void;
  resetGraph: (repoId?: string | null) => number;
  reset: () => void;
}

export type GraphStore = GraphStoreState & GraphStoreActions;

let nextReqId = 1;
function generateRequestId(): string {
  return `req-${Date.now()}-${nextReqId++}`;
}

const initialPersistedState = loadPersistedState();

export const useGraphStore = create<GraphStore>((set, get) => ({
  commits: [],
  cursor: undefined,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  isFetching: false,
  error: null,
  selectedBranch: initialPersistedState?.selectedBranch ?? 'all',
  searchTerm: initialPersistedState?.searchTerm ?? '',
  searchType: 'all',
  filterAuthor: '',
  filterDateSince: '',
  filterDateUntil: '',
  filterPath: '',
  searchMatches: [],
  currentMatchIndex: -1,
  activeRepoId: initialPersistedState?.activeRepositoryId ?? null,
  currentRequestId: null,
  revealCommitSha: null,
  generation: 0,

  startLoadingPage: (options: StartLoadingOptions) => {
    const state = get();
    const requestId = options.requestId || generateRequestId();

    if (options.isNextPage) {
      // Backpressure: prevent multiple concurrent next-page requests
      if (state.isLoadingMore) {
        return {
          requestId: state.currentRequestId ?? requestId,
          generation: state.generation,
          ignored: true,
        };
      }
      set({
        isLoading: false,
        isLoadingMore: true,
        currentRequestId: requestId,
        error: null,
      });
      return { requestId, generation: state.generation };
    }

    // New initial query: increment generation
    const nextGeneration = state.generation + 1;
    const sameRepo = Boolean(
      options.repositoryId && state.activeRepoId && state.activeRepoId === options.repositoryId,
    );
    const shouldPreserve = options.preserveCommits ?? (sameRepo && state.commits.length > 0);

    set({
      activeRepoId: options.repositoryId,
      isLoading: !shouldPreserve,
      isLoadingMore: false,
      isFetching: shouldPreserve,
      currentRequestId: requestId,
      generation: nextGeneration,
      commits: shouldPreserve ? state.commits : [],
      cursor: shouldPreserve ? state.cursor : undefined,
      hasMore: shouldPreserve ? state.hasMore : false,
      error: null,
    });
    return { requestId, generation: nextGeneration };
  },

  receiveCommitsPage: (options: ReceiveCommitsPageOptions) => {
    const state = get();

    // 1. Discard stale response by generation
    if (options.generation !== undefined && options.generation < state.generation) {
      return false;
    }

    // 2. Discard stale response by request ID if request ID is tracked
    if (
      options.requestId &&
      state.currentRequestId &&
      options.requestId !== state.currentRequestId
    ) {
      return false;
    }

    // 3. Discard stale response if repository does not match active repository
    const activeRepo = useRepositoryStore.getState().getActiveRepository();
    const isMatchingRepo =
      !state.activeRepoId ||
      options.repositoryId === state.activeRepoId ||
      (activeRepo &&
        (activeRepo.id === options.repositoryId ||
          activeRepo.path === options.repositoryId ||
          /^repo-\d+$/.test(options.repositoryId) ||
          options.repositoryId === 'repo-workspace'));

    if (!isMatchingRepo) {
      return false;
    }

    const isChunkSequence = options.chunkIndex !== undefined;
    const isFirstChunk = !isChunkSequence || options.chunkIndex === 0;
    const isLastChunk = options.isLastChunk !== false;

    const isAppending =
      (isChunkSequence && !isFirstChunk) ||
      (options.isAppend !== undefined
        ? options.isAppend
        : state.isLoadingMore || (state.commits.length > 0 && Boolean(state.cursor)));

    let nextCommits: Commit[];

    if (isAppending) {
      // Deduplicate incoming commits against existing commits by SHA
      const existingShas = new Set(state.commits.map((c) => c.sha));
      const appendedCommits: Commit[] = [];
      for (const commit of options.page.commits) {
        if (!existingShas.has(commit.sha)) {
          existingShas.add(commit.sha);
          appendedCommits.push(commit);
        }
      }
      nextCommits = [...state.commits, ...appendedCommits];
    } else {
      // Deduplicate initial page commits within itself by SHA
      const seenShas = new Set<string>();
      const dedupedCommits: Commit[] = [];
      for (const commit of options.page.commits) {
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha);
          dedupedCommits.push(commit);
        }
      }
      nextCommits = dedupedCommits;
    }

    if (isLastChunk) {
      set({
        commits: nextCommits,
        cursor: options.page.cursor ?? state.cursor,
        hasMore: options.page.hasMore,
        isLoading: false,
        isLoadingMore: false,
        isFetching: false,
        error: null,
      });
    } else {
      // Progressive update: display commits as chunks arrive
      set({
        commits: nextCommits,
        isLoading: false,
        isFetching: false,
        error: null,
      });
    }

    return true;
  },

  setSelectedBranch: (branch: string) => {
    const state = get();
    if (state.selectedBranch === branch) {
      return state.generation;
    }
    const nextGeneration = state.generation + 1;
    savePersistedState({ selectedBranch: branch });
    set({
      selectedBranch: branch,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setSearchTerm: (search: string, options?: { resetCommits?: boolean }) => {
    const state = get();
    if (state.searchTerm === search) {
      return state.generation;
    }
    savePersistedState({ searchTerm: search });

    if (options?.resetCommits === false) {
      set({ searchTerm: search });
      return state.generation;
    }

    const nextGeneration = state.generation + 1;
    set({
      searchTerm: search,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setSearchType: (type: SearchType) => {
    set({ searchType: type });
  },

  setFilterAuthor: (author: string) => {
    const state = get();
    if (state.filterAuthor === author) {
      return state.generation;
    }
    const nextGeneration = state.generation + 1;
    set({
      filterAuthor: author,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setFilterDateRange: (since?: string, until?: string) => {
    const state = get();
    const s = since ?? '';
    const u = until ?? '';
    if (state.filterDateSince === s && state.filterDateUntil === u) {
      return state.generation;
    }
    const nextGeneration = state.generation + 1;
    set({
      filterDateSince: s,
      filterDateUntil: u,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setFilterPath: (path: string) => {
    const state = get();
    const p = path.trim();
    if (state.filterPath === p) {
      return state.generation;
    }
    const nextGeneration = state.generation + 1;
    set({
      filterPath: p,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setSearchMatches: (matches: string[]) => {
    const state = get();
    const currentSha =
      state.currentMatchIndex >= 0 && state.currentMatchIndex < state.searchMatches.length
        ? state.searchMatches[state.currentMatchIndex]
        : null;

    let newIndex = -1;
    if (currentSha && matches.includes(currentSha)) {
      newIndex = matches.indexOf(currentSha);
    } else if (matches.length > 0) {
      newIndex = 0;
    }

    set({ searchMatches: matches, currentMatchIndex: newIndex });
  },

  setCurrentMatchIndex: (index: number) => {
    set({ currentMatchIndex: index });
  },

  nextMatch: () => {
    const state = get();
    if (state.searchMatches.length === 0) return;
    const nextIndex =
      state.currentMatchIndex < 0 || state.currentMatchIndex >= state.searchMatches.length - 1
        ? 0
        : state.currentMatchIndex + 1;
    set({ currentMatchIndex: nextIndex });
  },

  prevMatch: () => {
    const state = get();
    if (state.searchMatches.length === 0) return;
    const prevIndex =
      state.currentMatchIndex <= 0 ? state.searchMatches.length - 1 : state.currentMatchIndex - 1;
    set({ currentMatchIndex: prevIndex });
  },

  clearAllFilters: () => {
    const state = get();
    const nextGeneration = state.generation + 1;
    savePersistedState({
      selectedBranch: 'all',
      searchTerm: '',
    });
    set({
      selectedBranch: 'all',
      searchTerm: '',
      searchType: 'all',
      filterAuthor: '',
      filterDateSince: '',
      filterDateUntil: '',
      filterPath: '',
      searchMatches: [],
      currentMatchIndex: -1,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setActiveRepoId: (repoId: string | null) => {
    const state = get();
    if (state.activeRepoId === repoId) {
      return state.generation;
    }
    const nextGeneration = state.generation + 1;
    set({
      activeRepoId: repoId,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  setError: (error: string | null, requestId?: string) => {
    const state = get();
    if (requestId && state.currentRequestId && requestId !== state.currentRequestId) {
      return;
    }
    set({
      error,
      isLoading: false,
      isLoadingMore: false,
      isFetching: false,
    });
  },

  setIsFetching: (isFetching: boolean) => set({ isFetching }),

  setRevealCommitSha: (sha: string | null) => set({ revealCommitSha: sha }),

  resetGraph: (repoId?: string | null) => {
    const state = get();
    const nextGeneration = state.generation + 1;
    set({
      activeRepoId: repoId !== undefined ? repoId : state.activeRepoId,
      generation: nextGeneration,
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isFetching: false,
      error: null,
      currentRequestId: null,
      revealCommitSha: null,
    });
    return nextGeneration;
  },

  reset: () => {
    set({
      commits: [],
      cursor: undefined,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isFetching: false,
      error: null,
      selectedBranch: 'all',
      searchTerm: '',
      searchType: 'all',
      filterAuthor: '',
      filterDateSince: '',
      filterDateUntil: '',
      filterPath: '',
      searchMatches: [],
      currentMatchIndex: -1,
      activeRepoId: null,
      currentRequestId: null,
      revealCommitSha: null,
      generation: 0,
    });
    savePersistedState({
      selectedBranch: 'all',
      searchTerm: '',
    });
  },
}));
