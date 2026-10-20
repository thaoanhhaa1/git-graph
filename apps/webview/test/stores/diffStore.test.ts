import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiffStore, buildDiffCacheKey } from '../../src/stores/diffStore';
import * as messageRouter from '../../src/messaging/messageRouter';
import type { FileChange } from '@git-graph/shared';

describe('diffStore', () => {
  beforeEach(() => {
    useDiffStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('builds unique cache key with repoId, sha, parentSha, and filePath', () => {
    const key1 = buildDiffCacheKey('repo-1', 'sha123', 'src/index.ts', 'parent456');
    const key2 = buildDiffCacheKey('repo-1', 'sha123', 'src/index.ts');

    expect(key1).toBe('repo-1::sha123::parent456::src/index.ts');
    expect(key2).toBe('repo-1::sha123::::src/index.ts');
  });

  it('selects file and clears when passed null', () => {
    const file: FileChange = {
      path: 'src/App.tsx',
      status: 'modified',
      isBinary: false,
      additions: 10,
      deletions: 2,
    };

    useDiffStore.getState().selectFile(file);
    expect(useDiffStore.getState().selectedFilePath).toBe('src/App.tsx');
    expect(useDiffStore.getState().selectedFile).toEqual(file);

    useDiffStore.getState().selectFile(null);
    expect(useDiffStore.getState().selectedFilePath).toBeNull();
    expect(useDiffStore.getState().selectedFile).toBeNull();
    expect(useDiffStore.getState().diffResult).toBeNull();
  });

  it('requests diff via messageRouter and sets loading state', () => {
    const requestSpy = vi.spyOn(messageRouter, 'requestCommitDiff').mockImplementation(() => {});

    useDiffStore.getState().requestDiff('repo-1', 'sha-1', 'src/file.ts', 'parent-1');

    expect(useDiffStore.getState().isLoading).toBe(true);
    expect(useDiffStore.getState().selectedFilePath).toBe('src/file.ts');
    expect(requestSpy).toHaveBeenCalledWith(
      'repo-1',
      'sha-1',
      'src/file.ts',
      'parent-1',
      undefined,
    );
  });

  it('uses a distinct cache key and staged flag for staged diffs', () => {
    const requestSpy = vi.spyOn(messageRouter, 'requestCommitDiff').mockImplementation(() => {});

    expect(buildDiffCacheKey('repo-1', '*', 'src/file.ts', undefined, true)).toBe(
      'repo-1::*::::src/file.ts::staged',
    );

    useDiffStore.getState().requestDiff('repo-1', '*', 'src/file.ts', undefined, undefined, true);

    expect(requestSpy).toHaveBeenCalledWith(
      'repo-1',
      '*',
      'src/file.ts',
      undefined,
      undefined,
      true,
    );
    expect(useDiffStore.getState().currentStaged).toBe(true);
  });

  it('does not apply an unstaged result to an active staged diff', () => {
    useDiffStore.setState({
      currentRepositoryId: 'repo-1',
      currentSha: '*',
      selectedFilePath: 'src/file.ts',
      currentStaged: true,
      isLoading: true,
    });

    useDiffStore.getState().receiveDiff({
      repositoryId: 'repo-1',
      sha: '*',
      filePath: 'src/file.ts',
      diff: 'unstaged content',
      isTruncated: false,
      isBinary: false,
    });

    expect(useDiffStore.getState().isLoading).toBe(true);
    expect(useDiffStore.getState().diffResult).toBeNull();
  });

  it('uses cached diff without re-requesting from messageRouter', () => {
    const requestSpy = vi.spyOn(messageRouter, 'requestCommitDiff').mockImplementation(() => {});

    // Seed cache
    const key = buildDiffCacheKey('repo-1', 'sha-1', 'src/file.ts', 'parent-1');
    useDiffStore.getState().cache.set(key, {
      diff: 'dummy diff content',
      isTruncated: false,
      isBinary: false,
    });

    useDiffStore.getState().requestDiff('repo-1', 'sha-1', 'src/file.ts', 'parent-1');

    expect(useDiffStore.getState().isLoading).toBe(false);
    expect(useDiffStore.getState().diffResult?.diff).toBe('dummy diff content');
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('receives diff and updates cache and active diffResult when matches', () => {
    useDiffStore.setState({
      currentRepositoryId: 'repo-1',
      currentSha: 'sha-1',
      selectedFilePath: 'src/file.ts',
      isLoading: true,
    });

    useDiffStore.getState().receiveDiff({
      repositoryId: 'repo-1',
      sha: 'sha-1',
      filePath: 'src/file.ts',
      diff: '+added line\n-deleted line',
      isTruncated: false,
      isBinary: false,
    });

    const state = useDiffStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.diffResult?.diff).toBe('+added line\n-deleted line');

    const key = buildDiffCacheKey('repo-1', 'sha-1', 'src/file.ts');
    expect(state.cache.get(key)?.diff).toBe('+added line\n-deleted line');
  });

  it('handles error state', () => {
    useDiffStore.setState({ isLoading: true });
    useDiffStore.getState().setError('Failed to diff');

    expect(useDiffStore.getState().isLoading).toBe(false);
    expect(useDiffStore.getState().error).toBe('Failed to diff');
  });

  it('clears diff and resets state', () => {
    useDiffStore.setState({
      selectedFilePath: 'test.ts',
      diffResult: { diff: 'abc', isTruncated: false, isBinary: false },
      isLoading: true,
      error: 'err',
    });

    useDiffStore.getState().clearDiff();
    expect(useDiffStore.getState().selectedFilePath).toBeNull();
    expect(useDiffStore.getState().diffResult).toBeNull();
    expect(useDiffStore.getState().isLoading).toBe(false);

    useDiffStore.getState().reset();
    expect(useDiffStore.getState().cache.size).toBe(0);
  });
});
