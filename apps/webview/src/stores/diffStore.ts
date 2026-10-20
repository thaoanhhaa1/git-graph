import { create } from 'zustand';
import type { DiffResult, FileChange, CommitDiffResultPayload } from '@git-graph/shared';
import { requestCommitDiff } from '../messaging/messageRouter';

export interface DiffStoreState {
  selectedFilePath: string | null;
  selectedFile: FileChange | null;
  diffResult: DiffResult | null;
  isLoading: boolean;
  error: string | null;
  currentRepositoryId: string | null;
  currentSha: string | null;
  currentParentSha: string | null;
  currentStaged: boolean;
  /**
   * Internal imperative cache: mutated in place and bounded by
   * `DIFF_CACHE_LIMIT`, so its Map reference never changes.
   * Do not subscribe reactively to this field; read it via
   * `useDiffStore.getState().cache`.
   */
  cache: Map<string, DiffResult>;
}

export interface DiffStoreActions {
  selectFile: (file: FileChange | null) => void;
  requestDiff: (
    repositoryId: string,
    sha: string,
    filePath: string,
    parentSha?: string,
    maxBytes?: number,
    staged?: boolean,
    baseSha?: string,
    targetSha?: string,
  ) => void;
  receiveDiff: (payload: CommitDiffResultPayload) => void;
  setError: (error: string | null) => void;
  clearDiff: () => void;
  reset: () => void;
}

export type DiffStore = DiffStoreState & DiffStoreActions;

/** Maximum number of cached diffs before the oldest entry is evicted. */
export const DIFF_CACHE_LIMIT = 100;

function withCacheEntry(
  cache: Map<string, DiffResult>,
  key: string,
  diff: DiffResult,
): Map<string, DiffResult> {
  // Mutate in place: copying the whole map per diff result allocates and grows unbounded.
  cache.delete(key);
  cache.set(key, diff);
  while (cache.size > DIFF_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  return cache;
}

export function buildDiffCacheKey(
  repositoryId: string,
  sha: string,
  filePath: string,
  parentSha?: string,
  staged?: boolean,
  baseSha?: string,
  targetSha?: string,
): string {
  const effectiveBase = baseSha ?? parentSha ?? '';
  const effectiveTarget = targetSha ?? sha;
  return `${repositoryId}::${effectiveTarget}::${effectiveBase}::${filePath}${staged ? '::staged' : ''}`;
}

export const useDiffStore = create<DiffStore>((set, get) => ({
  selectedFilePath: null,
  selectedFile: null,
  diffResult: null,
  isLoading: false,
  error: null,
  currentRepositoryId: null,
  currentSha: null,
  currentParentSha: null,
  currentStaged: false,
  cache: new Map<string, DiffResult>(),

  selectFile: (file: FileChange | null) => {
    if (!file) {
      set({
        selectedFile: null,
        selectedFilePath: null,
        diffResult: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({
      selectedFile: file,
      selectedFilePath: file.path,
    });
  },

  requestDiff: (
    repositoryId: string,
    sha: string,
    filePath: string,
    parentSha?: string,
    maxBytes?: number,
    staged?: boolean,
    baseSha?: string,
    targetSha?: string,
  ) => {
    const { cache } = get();
    const effectiveBase = baseSha ?? parentSha;
    const effectiveTarget = targetSha ?? sha;
    const key = buildDiffCacheKey(
      repositoryId,
      sha,
      filePath,
      parentSha,
      staged,
      baseSha,
      targetSha,
    );
    const cached = cache.get(key);

    if (cached) {
      set({
        selectedFilePath: filePath,
        currentRepositoryId: repositoryId,
        currentSha: effectiveTarget,
        currentParentSha: effectiveBase ?? null,
        currentStaged: Boolean(staged),
        diffResult: cached,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({
      selectedFilePath: filePath,
      currentRepositoryId: repositoryId,
      currentSha: effectiveTarget,
      currentParentSha: effectiveBase ?? null,
      currentStaged: Boolean(staged),
      diffResult: null,
      isLoading: true,
      error: null,
    });

    if (baseSha || targetSha) {
      requestCommitDiff(
        repositoryId,
        effectiveTarget,
        filePath,
        effectiveBase,
        maxBytes,
        Boolean(staged),
        baseSha,
        targetSha,
      );
    } else if (staged) {
      requestCommitDiff(repositoryId, effectiveTarget, filePath, effectiveBase, maxBytes, true);
    } else {
      requestCommitDiff(repositoryId, effectiveTarget, filePath, effectiveBase, maxBytes);
    }
  },

  receiveDiff: (payload: CommitDiffResultPayload) => {
    const { cache, selectedFilePath, currentSha, currentRepositoryId, currentStaged } = get();
    const filePath = payload.filePath ?? '';
    const staged = Boolean(payload.staged);
    const effectiveTarget = payload.targetSha ?? payload.sha;
    const key = buildDiffCacheKey(
      payload.repositoryId,
      payload.sha,
      filePath,
      payload.parentSha,
      staged,
      payload.baseSha,
      payload.targetSha,
    );

    const diffResult: DiffResult = {
      diff: payload.diff,
      isTruncated: Boolean(payload.isTruncated),
      isBinary: Boolean(payload.isBinary),
      truncatedBytes: payload.truncatedBytes,
      totalBytes: payload.totalBytes,
    };

    const newCache = withCacheEntry(cache, key, diffResult);

    const isCurrentMatch =
      currentRepositoryId === payload.repositoryId &&
      (currentSha === payload.sha || currentSha === effectiveTarget) &&
      selectedFilePath === filePath &&
      currentStaged === staged;

    if (isCurrentMatch) {
      set({
        diffResult,
        isLoading: false,
        error: null,
        cache: newCache,
      });
    } else {
      set({ cache: newCache });
    }
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  clearDiff: () => {
    set({
      selectedFilePath: null,
      selectedFile: null,
      diffResult: null,
      isLoading: false,
      error: null,
    });
  },

  reset: () => {
    set({
      selectedFilePath: null,
      selectedFile: null,
      diffResult: null,
      isLoading: false,
      error: null,
      currentRepositoryId: null,
      currentSha: null,
      currentParentSha: null,
      currentStaged: false,
      cache: new Map<string, DiffResult>(),
    });
  },
}));
