import { create } from 'zustand';
import type { Commit } from '@git-graph/shared';
import { requestCommitDetails } from '../messaging/messageRouter';

export interface DetailsStoreState {
  currentSha: string | null;
  currentRepositoryId: string | null;
  selectedParentSha: string | null;
  details: Commit | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Internal imperative cache: mutated in place and bounded by
   * `DETAILS_CACHE_LIMIT`, so its Map reference never changes.
   * Do not subscribe reactively to this field; read it via
   * `useDetailsStore.getState().cache`.
   */
  cache: Map<string, Commit>;
}

export interface DetailsStoreActions {
  requestDetails: (repositoryId: string, sha: string, parentSha?: string) => void;
  receiveDetails: (repositoryId: string, commit: Commit, parentSha?: string) => void;
  selectParent: (parentSha: string) => void;
  setError: (error: string | null) => void;
  clearDetails: () => void;
  reset: () => void;
}

export type DetailsStore = DetailsStoreState & DetailsStoreActions;

/** Maximum number of cached commit details before the oldest entry is evicted. */
export const DETAILS_CACHE_LIMIT = 500;

function withCacheEntry(
  cache: Map<string, Commit>,
  key: string,
  commit: Commit,
): Map<string, Commit> {
  // Mutate in place: copying the whole map on every message is O(cache size)
  // and allocates on a hot path.
  cache.delete(key);
  cache.set(key, commit);
  while (cache.size > DETAILS_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  return cache;
}

export function buildDetailsCacheKey(
  repositoryId: string,
  sha: string,
  parentSha?: string,
): string {
  return `${repositoryId}::${sha}::${parentSha ?? ''}`;
}

export const useDetailsStore = create<DetailsStore>((set, get) => ({
  currentSha: null,
  currentRepositoryId: null,
  selectedParentSha: null,
  details: null,
  isLoading: false,
  error: null,
  cache: new Map<string, Commit>(),

  requestDetails: (repositoryId: string, sha: string, parentSha?: string) => {
    const { cache } = get();
    const key = buildDetailsCacheKey(repositoryId, sha, parentSha);
    const cached = cache.get(key);

    if (cached) {
      set({
        currentSha: sha,
        currentRepositoryId: repositoryId,
        selectedParentSha: parentSha ?? null,
        details: cached,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({
      currentSha: sha,
      currentRepositoryId: repositoryId,
      selectedParentSha: parentSha ?? null,
      details: null,
      isLoading: true,
      error: null,
    });

    requestCommitDetails(repositoryId, sha, parentSha);
  },

  receiveDetails: (repositoryId: string, commit: Commit, parentSha?: string) => {
    const { cache, currentSha, selectedParentSha } = get();
    const key = buildDetailsCacheKey(
      repositoryId,
      commit.sha,
      parentSha ?? selectedParentSha ?? undefined,
    );

    withCacheEntry(cache, key, commit);

    // Also cache under shortSha for quick lookups
    if (commit.shortSha) {
      const shortKey = buildDetailsCacheKey(
        repositoryId,
        commit.shortSha,
        parentSha ?? selectedParentSha ?? undefined,
      );
      withCacheEntry(cache, shortKey, commit);
    }

    const newCache = cache;

    const isCurrentMatch =
      currentSha === commit.sha ||
      currentSha === commit.shortSha ||
      (currentSha && commit.sha.startsWith(currentSha));

    if (isCurrentMatch) {
      set({
        details: commit,
        isLoading: false,
        error: null,
        cache: newCache,
      });
    } else {
      set({ cache: newCache });
    }
  },

  selectParent: (parentSha: string) => {
    const { currentRepositoryId, currentSha } = get();
    if (currentRepositoryId && currentSha) {
      get().requestDetails(currentRepositoryId, currentSha, parentSha);
    }
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  clearDetails: () => {
    set({
      currentSha: null,
      selectedParentSha: null,
      details: null,
      isLoading: false,
      error: null,
    });
  },

  reset: () => {
    set({
      currentSha: null,
      currentRepositoryId: null,
      selectedParentSha: null,
      details: null,
      isLoading: false,
      error: null,
      cache: new Map<string, Commit>(),
    });
  },
}));
