import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Commit } from '@git-graph/shared';
import type { GitRepository } from '@git-graph/git-core';
import { CommitDetailsController } from '../src/application/CommitDetailsController';
import { RefreshCoordinator } from '../src/application/RefreshCoordinator';
import { RepositoryManager } from '../src/repositories/RepositoryManager';

function createDummyCommit(sha: string, subject = 'test commit', parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Author Name',
      email: 'author@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Committer Name',
      email: 'committer@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    subject,
    body: 'Commit detailed description body\n\nFixes #123',
    refs: [],
    fileChanges: [
      {
        path: 'src/index.ts',
        status: 'modified',
        additions: 10,
        deletions: 2,
        isBinary: false,
      },
    ],
    stats: {
      filesChanged: 1,
      additions: 10,
      deletions: 2,
    },
  };
}

describe('CommitDetailsController', () => {
  let controller: CommitDetailsController;
  let repositoryManager: RepositoryManager;
  let refreshCoordinator: RefreshCoordinator;
  let mockGitRepo: Partial<GitRepository>;

  beforeEach(() => {
    repositoryManager = new RepositoryManager();
    refreshCoordinator = new RefreshCoordinator();

    mockGitRepo = {
      getCommitDetails: vi.fn(),
    };

    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) => {
      if (id === 'repo-1') {
        return mockGitRepo as GitRepository;
      }
      return undefined;
    });

    controller = new CommitDetailsController({
      repositoryManager,
      refreshCoordinator,
      maxCacheSize: 5,
    });
  });

  afterEach(() => {
    controller?.dispose();
    refreshCoordinator?.dispose();
    repositoryManager?.dispose();
  });

  it('returns null if repositoryId or sha is missing', async () => {
    const result1 = await controller.getCommitDetails('', 'sha1');
    const result2 = await controller.getCommitDetails('repo-1', '');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(mockGitRepo.getCommitDetails).not.toHaveBeenCalled();
  });

  it('returns null if repository is not found', async () => {
    const result = await controller.getCommitDetails('unknown-repo', 'sha1');
    expect(result).toBeNull();
    expect(mockGitRepo.getCommitDetails).not.toHaveBeenCalled();
  });

  it('fetches commit details from GitRepository on cache miss and caches the result', async () => {
    const dummyCommit = createDummyCommit('a1b2c3d4e5f67890123456789abcdef012345678');
    (mockGitRepo.getCommitDetails as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dummyCommit);

    const result = await controller.getCommitDetails('repo-1', dummyCommit.sha);
    expect(result).toEqual(dummyCommit);
    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledWith(dummyCommit.sha);

    // Second call should hit the cache without calling repository again
    const cachedResult = await controller.getCommitDetails('repo-1', dummyCommit.sha);
    expect(cachedResult).toEqual(dummyCommit);
    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledTimes(1);

    expect(controller.getCached('repo-1', dummyCommit.sha)).toEqual(dummyCommit);
  });

  it('supports parentSha for merge commits and caches separately', async () => {
    const mergeCommitParent1 = createDummyCommit(
      'merge11111111111111111111111111111111111',
      'merge commit',
      ['parent1', 'parent2'],
    );
    const mergeCommitParent2 = {
      ...mergeCommitParent1,
      stats: { filesChanged: 3, additions: 50, deletions: 10 },
    };

    (mockGitRepo.getCommitDetails as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mergeCommitParent1)
      .mockResolvedValueOnce(mergeCommitParent2);

    const res1 = await controller.getCommitDetails('repo-1', mergeCommitParent1.sha, 'parent1');
    expect(res1).toEqual(mergeCommitParent1);
    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledWith(mergeCommitParent1.sha, {
      parentSha: 'parent1',
    });

    const res2 = await controller.getCommitDetails('repo-1', mergeCommitParent1.sha, 'parent2');
    expect(res2).toEqual(mergeCommitParent2);
    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledWith(mergeCommitParent1.sha, {
      parentSha: 'parent2',
    });

    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent requests for the same repository, SHA, and parent', async () => {
    const dummyCommit = createDummyCommit('sha-coalesce');
    let resolveCall: (commit: Commit) => void;
    const pendingPromise = new Promise<Commit>((resolve) => {
      resolveCall = resolve;
    });

    (mockGitRepo.getCommitDetails as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingPromise);

    const promise1 = controller.getCommitDetails('repo-1', 'sha-coalesce');
    const promise2 = controller.getCommitDetails('repo-1', 'sha-coalesce');

    resolveCall!(dummyCommit);

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual(dummyCommit);
    expect(res2).toEqual(dummyCommit);
    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledTimes(1);
  });

  it('clears repository cache on RefreshCoordinator invalidation', async () => {
    const dummyCommit = createDummyCommit('sha-inval');
    (mockGitRepo.getCommitDetails as ReturnType<typeof vi.fn>).mockResolvedValue(dummyCommit);

    await controller.getCommitDetails('repo-1', 'sha-inval');
    expect(controller.getCached('repo-1', 'sha-inval')).toBeDefined();

    // Trigger repository invalidation
    refreshCoordinator.invalidate('repo-1', 'fs-change');

    expect(controller.getCached('repo-1', 'sha-inval')).toBeUndefined();
  });

  it('evicts oldest cache item when maxCacheSize is exceeded', async () => {
    for (let i = 1; i <= 6; i++) {
      const sha = `sha-${i}`;
      const c = createDummyCommit(sha);
      (mockGitRepo.getCommitDetails as ReturnType<typeof vi.fn>).mockResolvedValueOnce(c);
      await controller.getCommitDetails('repo-1', sha);
    }

    // Since maxCacheSize is 5, sha-1 should have been evicted
    expect(controller.getCached('repo-1', 'sha-1')).toBeUndefined();
    expect(controller.getCached('repo-1', 'sha-6')).toBeDefined();
  });
});
