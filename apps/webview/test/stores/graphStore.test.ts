import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../../src/stores/graphStore';
import { setVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { Commit, CommitPage } from '@git-graph/shared';

describe('graphStore', () => {
  beforeEach(() => {
    setVsCodeApi(createMockVsCodeApi());
    useGraphStore.getState().reset();

    describe('Incremental chunk loading and backpressure', () => {
      it('progressively receives chunked commits pages and completes on last chunk', () => {
        const { requestId, generation } = useGraphStore.getState().startLoadingPage({
          repositoryId: 'repo-1',
        });

        const chunk0Commits = [makeCommit('c100'), makeCommit('c101')];
        const chunk1Commits = [makeCommit('c102'), makeCommit('c103')];

        // Chunk 0 arrives (not last chunk)
        const res0 = useGraphStore.getState().receiveCommitsPage({
          repositoryId: 'repo-1',
          page: { commits: chunk0Commits, hasMore: true },
          requestId,
          generation,
          chunkIndex: 0,
          totalChunks: 2,
          isLastChunk: false,
        });
        expect(res0).toBe(true);
        expect(useGraphStore.getState().commits).toHaveLength(2);
        expect(useGraphStore.getState().isLoading).toBe(false);

        // Chunk 1 arrives (last chunk)
        const res1 = useGraphStore.getState().receiveCommitsPage({
          repositoryId: 'repo-1',
          page: { commits: chunk1Commits, cursor: 'cursor-4', hasMore: true },
          requestId,
          generation,
          chunkIndex: 1,
          totalChunks: 2,
          isLastChunk: true,
        });
        expect(res1).toBe(true);
        expect(useGraphStore.getState().commits).toHaveLength(4);
        expect(useGraphStore.getState().commits.map((c) => c.sha)).toEqual([
          'c100',
          'c101',
          'c102',
          'c103',
        ]);
        expect(useGraphStore.getState().cursor).toBe('cursor-4');
        expect(useGraphStore.getState().hasMore).toBe(true);
        expect(useGraphStore.getState().isLoadingMore).toBe(false);
      });

      it('enforces backpressure by ignoring duplicate next page requests when already loading more', () => {
        useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
        useGraphStore.getState().receiveCommitsPage({
          repositoryId: 'repo-1',
          page: { commits: [makeCommit('c1')], cursor: 'c1', hasMore: true },
        });

        // First next page request
        const first = useGraphStore.getState().startLoadingPage({
          repositoryId: 'repo-1',
          isNextPage: true,
        });
        expect(first.ignored).toBeUndefined();
        expect(useGraphStore.getState().isLoadingMore).toBe(true);

        // Duplicate concurrent next page request while isLoadingMore is true
        const duplicate = useGraphStore.getState().startLoadingPage({
          repositoryId: 'repo-1',
          isNextPage: true,
        });
        expect(duplicate.ignored).toBe(true);
      });
    });
  });

  const makeCommit = (sha: string, subject = 'test commit'): Commit => ({
    sha,
    shortSha: sha.slice(0, 7),
    parents: [],
    author: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    subject,
    refs: [],
  });

  it('initializes with clean default state', () => {
    const state = useGraphStore.getState();
    expect(state.commits).toEqual([]);
    expect(state.cursor).toBeUndefined();
    expect(state.hasMore).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.isLoadingMore).toBe(false);
    expect(state.selectedBranch).toBe('all');
    expect(state.searchTerm).toBe('');
    expect(state.generation).toBe(0);
  });

  it('starts loading initial page and increments generation', () => {
    const { requestId, generation } = useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
    });

    const state = useGraphStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.isLoadingMore).toBe(false);
    expect(state.generation).toBe(1);
    expect(generation).toBe(1);
    expect(state.currentRequestId).toBe(requestId);
    expect(state.activeRepoId).toBe('repo-1');
  });

  it('starts loading next page without incrementing generation', () => {
    // Start initial page
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    expect(useGraphStore.getState().generation).toBe(1);

    // Start next page
    const { requestId, generation } = useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
      isNextPage: true,
    });

    const state = useGraphStore.getState();
    expect(state.isLoadingMore).toBe(true);
    expect(state.generation).toBe(1);
    expect(generation).toBe(1);
    expect(state.currentRequestId).toBe(requestId);
  });

  it('preserves commits and sets isFetching instead of isLoading during background refresh of same repo', () => {
    // Initial load
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [makeCommit('c100')], hasMore: false },
    });
    expect(useGraphStore.getState().commits).toHaveLength(1);

    // Refresh of same repo
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    const state = useGraphStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isFetching).toBe(true);
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0]?.sha).toBe('c100');
  });

  it('receives initial page and deduplicates commits within the page', () => {
    const { requestId, generation } = useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
    });

    const c1 = makeCommit('c111111111111111111111111111111111111111');
    const c2 = makeCommit('c222222222222222222222222222222222222222');
    const c1Dup = makeCommit('c111111111111111111111111111111111111111'); // duplicate SHA

    const page: CommitPage = {
      commits: [c1, c2, c1Dup],
      cursor: 'cursor-1',
      hasMore: true,
    };

    const accepted = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page,
      requestId,
      generation,
    });

    expect(accepted).toBe(true);
    const state = useGraphStore.getState();
    expect(state.commits).toHaveLength(2);
    expect(state.commits.map((c) => c.sha)).toEqual([c1.sha, c2.sha]);
    expect(state.cursor).toBe('cursor-1');
    expect(state.hasMore).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('deduplicates commits when appending subsequent pages', () => {
    const c1 = makeCommit('c111111111111111111111111111111111111111');
    const c2 = makeCommit('c222222222222222222222222222222222222222');
    const c3 = makeCommit('c333333333333333333333333333333333333333');

    // Load initial page
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [c1, c2], cursor: 'cursor-1', hasMore: true },
    });
    expect(useGraphStore.getState().commits).toHaveLength(2);

    // Load next page: contains c2 (overlap) and c3 (new)
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1', isNextPage: true });
    const accepted = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [c2, c3], cursor: 'cursor-2', hasMore: false },
      isAppend: true,
    });

    expect(accepted).toBe(true);
    const state = useGraphStore.getState();
    expect(state.commits).toHaveLength(3);
    expect(state.commits.map((c) => c.sha)).toEqual([c1.sha, c2.sha, c3.sha]);
    expect(state.cursor).toBe('cursor-2');
    expect(state.hasMore).toBe(false);
    expect(state.isLoadingMore).toBe(false);
  });

  it('discards stale response from older generation', () => {
    // Request 1 initiated at generation 1
    const { requestId: req1, generation: gen1 } = useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
    });
    expect(gen1).toBe(1);

    // User changes filter/branch: new query starts at generation 2
    const { requestId: req2, generation: gen2 } = useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
    });
    expect(gen2).toBe(2);

    // Stale response arrives for gen1
    const c1 = makeCommit('c111111111111111111111111111111111111111');
    const acceptedOld = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [c1], hasMore: false },
      requestId: req1,
      generation: gen1,
    });
    expect(acceptedOld).toBe(false);
    expect(useGraphStore.getState().commits).toHaveLength(0);

    // Fresh response arrives for gen2
    const c2 = makeCommit('c222222222222222222222222222222222222222');
    const acceptedNew = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [c2], hasMore: false },
      requestId: req2,
      generation: gen2,
    });
    expect(acceptedNew).toBe(true);
    expect(useGraphStore.getState().commits).toHaveLength(1);
    expect(useGraphStore.getState().commits[0]?.sha).toBe(c2.sha);
  });

  it('discards response if request ID does not match current tracked request', () => {
    useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
      requestId: 'req-active',
    });

    const accepted = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [makeCommit('c111111111111111111111111111111111111111')], hasMore: false },
      requestId: 'req-obsolete',
    });

    expect(accepted).toBe(false);
    expect(useGraphStore.getState().commits).toHaveLength(0);
  });

  it('discards response if repository ID does not match active repo', () => {
    useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-active',
    });

    const accepted = useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-other',
      page: { commits: [makeCommit('c111111111111111111111111111111111111111')], hasMore: false },
    });

    expect(accepted).toBe(false);
    expect(useGraphStore.getState().commits).toHaveLength(0);
  });

  it('increments generation and resets data on branch change', () => {
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [makeCommit('c111111111111111111111111111111111111111')], hasMore: false },
    });
    expect(useGraphStore.getState().commits).toHaveLength(1);

    const newGen = useGraphStore.getState().setSelectedBranch('feature/awesome');
    expect(newGen).toBe(2);
    expect(useGraphStore.getState().selectedBranch).toBe('feature/awesome');
    expect(useGraphStore.getState().commits).toEqual([]);
    expect(useGraphStore.getState().cursor).toBeUndefined();
  });

  it('increments generation and resets data on search term change', () => {
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: [makeCommit('c111111111111111111111111111111111111111')], hasMore: false },
    });

    const newGen = useGraphStore.getState().setSearchTerm('bugfix');
    expect(newGen).toBe(2);
    expect(useGraphStore.getState().searchTerm).toBe('bugfix');
    expect(useGraphStore.getState().commits).toEqual([]);
  });

  it('sets error properly and respects requestId', () => {
    useGraphStore.getState().startLoadingPage({
      repositoryId: 'repo-1',
      requestId: 'req-target',
    });

    // Error for other request is ignored
    useGraphStore.getState().setError('Stale error', 'req-other');
    expect(useGraphStore.getState().error).toBeNull();

    // Error for current request is applied
    useGraphStore.getState().setError('Git CLI failed', 'req-target');
    expect(useGraphStore.getState().error).toBe('Git CLI failed');
    expect(useGraphStore.getState().isLoading).toBe(false);
  });

  it('manages filterAuthor and increments generation', () => {
    const newGen = useGraphStore.getState().setFilterAuthor('Alice');
    expect(newGen).toBe(1);
    expect(useGraphStore.getState().filterAuthor).toBe('Alice');

    // Setting same author does not increment generation
    const sameGen = useGraphStore.getState().setFilterAuthor('Alice');
    expect(sameGen).toBe(1);
  });

  it('manages filterDateRange and increments generation', () => {
    const newGen = useGraphStore.getState().setFilterDateRange('2024-01-01', '2024-12-31');
    expect(newGen).toBe(1);
    expect(useGraphStore.getState().filterDateSince).toBe('2024-01-01');
    expect(useGraphStore.getState().filterDateUntil).toBe('2024-12-31');
  });

  it('manages filterPath and increments generation', () => {
    const newGen = useGraphStore.getState().setFilterPath('src/components/Button.tsx');
    expect(newGen).toBe(1);
    expect(useGraphStore.getState().filterPath).toBe('src/components/Button.tsx');

    // Setting same path does not increment generation
    const sameGen = useGraphStore.getState().setFilterPath('src/components/Button.tsx');
    expect(sameGen).toBe(1);
  });

  it('manages searchMatches and navigates with nextMatch / prevMatch', () => {
    useGraphStore.getState().setSearchMatches(['sha-1', 'sha-2', 'sha-3']);
    expect(useGraphStore.getState().currentMatchIndex).toBe(0);

    useGraphStore.getState().nextMatch();
    expect(useGraphStore.getState().currentMatchIndex).toBe(1);

    useGraphStore.getState().nextMatch();
    expect(useGraphStore.getState().currentMatchIndex).toBe(2);

    // Wraps to beginning
    useGraphStore.getState().nextMatch();
    expect(useGraphStore.getState().currentMatchIndex).toBe(0);

    // Wraps to end
    useGraphStore.getState().prevMatch();
    expect(useGraphStore.getState().currentMatchIndex).toBe(2);
  });

  it('clears all filters with clearAllFilters action', () => {
    useGraphStore.getState().setSelectedBranch('feature/test');
    useGraphStore.getState().setSearchTerm('query', { resetCommits: false });
    useGraphStore.getState().setFilterAuthor('John');
    useGraphStore.getState().setFilterDateRange('2024-01-01', '2024-02-01');
    useGraphStore.getState().setFilterPath('packages/core');
    useGraphStore.getState().setSearchMatches(['sha-1']);

    useGraphStore.getState().clearAllFilters();

    const state = useGraphStore.getState();
    expect(state.selectedBranch).toBe('all');
    expect(state.searchTerm).toBe('');
    expect(state.filterAuthor).toBe('');
    expect(state.filterDateSince).toBe('');
    expect(state.filterDateUntil).toBe('');
    expect(state.filterPath).toBe('');
    expect(state.searchMatches).toEqual([]);
    expect(state.currentMatchIndex).toBe(-1);
  });
});
