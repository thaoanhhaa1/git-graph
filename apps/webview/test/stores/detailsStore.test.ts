import { describe, it, expect, beforeEach } from 'vitest';
import type { Commit, MessageEnvelope } from '@git-graph/shared';
import { useDetailsStore, buildDetailsCacheKey } from '../../src/stores/detailsStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';

function createDummyCommit(sha: string, parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Tester',
      email: 'test@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'test@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    subject: 'test commit subject',
    body: 'test commit body\nwith multiline',
    refs: [],
    stats: {
      filesChanged: 2,
      additions: 15,
      deletions: 3,
    },
  };
}

describe('detailsStore', () => {
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];
    const mockApi = createMockVsCodeApi(undefined, (msg) => {
      postedMessages.push(msg as MessageEnvelope);
    });
    setVsCodeApi(mockApi);
    useDetailsStore.getState().reset();
  });

  it('initializes with default empty state', () => {
    const state = useDetailsStore.getState();
    expect(state.currentSha).toBeNull();
    expect(state.details).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.selectedParentSha).toBeNull();
    expect(state.cache.size).toBe(0);
  });

  it('requestDetails sets loading state and dispatches commit.details.request', () => {
    useDetailsStore.getState().requestDetails('repo-1', 'abc1234');

    const state = useDetailsStore.getState();
    expect(state.currentSha).toBe('abc1234');
    expect(state.isLoading).toBe(true);
    expect(state.details).toBeNull();

    expect(postedMessages.length).toBe(1);
    expect(postedMessages[0]!.type).toBe('commit.details.request');
    expect(postedMessages[0]!.payload).toEqual({
      repositoryId: 'repo-1',
      sha: 'abc1234',
    });
  });

  it('receiveDetails caches commit and updates current details when SHA matches', () => {
    const commit = createDummyCommit('a1b2c3d4e5f67890123456789abcdef012345678');
    useDetailsStore.getState().requestDetails('repo-1', commit.sha);

    useDetailsStore.getState().receiveDetails('repo-1', commit);

    const state = useDetailsStore.getState();
    expect(state.details).toEqual(commit);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();

    const cacheKey = buildDetailsCacheKey('repo-1', commit.sha);
    expect(state.cache.get(cacheKey)).toEqual(commit);
  });

  it('returns cached details immediately without posting message on cache hit', () => {
    const commit = createDummyCommit('a1b2c3d4e5f67890123456789abcdef012345678');
    useDetailsStore.getState().receiveDetails('repo-1', commit);

    postedMessages = [];
    useDetailsStore.getState().requestDetails('repo-1', commit.sha);

    const state = useDetailsStore.getState();
    expect(state.details).toEqual(commit);
    expect(state.isLoading).toBe(false);
    expect(postedMessages.length).toBe(0);
  });

  it('supports parentSha for merge commit comparisons', () => {
    const commitParent1 = createDummyCommit('merge-commit', ['parent1', 'parent2']);
    useDetailsStore.getState().requestDetails('repo-1', commitParent1.sha, 'parent1');

    expect(useDetailsStore.getState().selectedParentSha).toBe('parent1');
    const msg1 = postedMessages.find((m) => m.type === 'commit.details.request');
    expect(msg1?.payload).toEqual({
      repositoryId: 'repo-1',
      sha: 'merge-commit',
      parentSha: 'parent1',
    });

    useDetailsStore.getState().receiveDetails('repo-1', commitParent1, 'parent1');

    // Switch parent via selectParent
    postedMessages = [];
    useDetailsStore.getState().selectParent('parent2');
    expect(useDetailsStore.getState().selectedParentSha).toBe('parent2');

    const msg2 = postedMessages.find((m) => m.type === 'commit.details.request');
    expect(msg2?.payload).toEqual({
      repositoryId: 'repo-1',
      sha: 'merge-commit',
      parentSha: 'parent2',
    });
  });

  it('clears details and keeps cache on clearDetails', () => {
    const commit = createDummyCommit('commit-to-clear');
    useDetailsStore.getState().receiveDetails('repo-1', commit);
    useDetailsStore.getState().requestDetails('repo-1', commit.sha);

    useDetailsStore.getState().clearDetails();

    const state = useDetailsStore.getState();
    expect(state.details).toBeNull();
    expect(state.currentSha).toBeNull();
    expect(state.selectedParentSha).toBeNull();
    expect(state.cache.size).toBeGreaterThan(0);
  });

  it('resets all state including cache on reset', () => {
    const commit = createDummyCommit('commit-to-reset');
    useDetailsStore.getState().receiveDetails('repo-1', commit);

    useDetailsStore.getState().reset();

    const state = useDetailsStore.getState();
    expect(state.details).toBeNull();
    expect(state.cache.size).toBe(0);
  });
});

describe('detailsStore cache bounds', () => {
  it('evicts the oldest entries once the cache limit is exceeded', async () => {
    const { DETAILS_CACHE_LIMIT } = await import('../../src/stores/detailsStore');
    useDetailsStore.getState().reset();

    for (let i = 0; i < DETAILS_CACHE_LIMIT + 20; i++) {
      const sha = i.toString(16).padStart(40, '0');
      useDetailsStore.getState().receiveDetails('repo-1', createDummyCommit(sha));
    }

    const state = useDetailsStore.getState();
    // Two keys (full + short SHA) per commit, capped at the limit.
    expect(state.cache.size).toBeLessThanOrEqual(DETAILS_CACHE_LIMIT);
    // The newest commit must still be cached.
    const newestSha = (DETAILS_CACHE_LIMIT + 19).toString(16).padStart(40, '0');
    expect(state.cache.has(buildDetailsCacheKey('repo-1', newestSha))).toBe(true);
  });
});
