import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GitRepository, GitResult } from '@git-graph/git-core';
import { GitOperationService } from '../src/operations/GitOperationService';
import { RepositoryManager } from '../src/repositories/RepositoryManager';
import { RefreshCoordinator } from '../src/application/RefreshCoordinator';

function createMockGitResult(stdout = '', stderr = '', exitCode = 0): GitResult {
  return {
    stdout,
    stderr,
    exitCode,
    stdoutBuffer: Buffer.from(stdout),
    stderrBuffer: Buffer.from(stderr),
    durationMs: 1,
    command: 'git mock',
    args: ['mock'],
  };
}

function createMockRepo(execMock: (args: readonly string[]) => Promise<GitResult>): GitRepository {
  return {
    descriptor: {
      id: 'repo-1',
      name: 'Test Repo',
      rootPath: '/fake/repo-1',
      gitDir: '/fake/repo-1/.git',
      isBare: false,
    },
    rootPath: '/fake/repo-1',
    gitDir: '/fake/repo-1/.git',
    isBare: false,
    id: 'repo-1',
    name: 'Test Repo',
    getRemotes: vi.fn().mockResolvedValue(['origin']),
    exec: vi.fn(execMock),
  } as unknown as GitRepository;
}

describe('GitOperationService synchronization', () => {
  let service: GitOperationService;
  let repositoryManager: RepositoryManager;
  let mockRepo: GitRepository;
  let execCalls: string[][];

  beforeEach(() => {
    execCalls = [];
    mockRepo = createMockRepo(async (args) => {
      execCalls.push([...args]);
      if (args[0] === 'status') {
        return createMockGitResult('');
      }
      if (args[0] === 'symbolic-ref') {
        return createMockGitResult('main\n');
      }
      if (args[0] === 'rev-parse' && args.includes('--verify')) {
        return createMockGitResult('head-sha\n');
      }
      return createMockGitResult();
    });

    repositoryManager = new RepositoryManager();
    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) =>
      id === 'repo-1' ? mockRepo : undefined,
    );
    vi.spyOn(repositoryManager, 'refresh').mockResolvedValue(undefined);

    service = new GitOperationService({
      repositoryManager,
      refreshCoordinator: new RefreshCoordinator(),
      logger: () => undefined,
    });
  });

  it('captures undo metadata when an undoable operation changes HEAD', async () => {
    let headReads = 0;
    (mockRepo.exec as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: readonly string[]) => {
        execCalls.push([...args]);
        if (args[0] === 'rev-parse' && args.includes('--verify')) {
          headReads += 1;
          return createMockGitResult(headReads === 1 ? 'before-sha\n' : 'after-sha\n');
        }
        return createMockGitResult();
      },
    );

    const result = await service.runOperation({
      operationId: 'merge-1',
      repositoryId: 'repo-1',
      type: 'merge',
      undoLabel: 'merge feature',
      execute: async () => ({ ok: true }),
    });

    expect(result.success).toBe(true);
    expect(result.undo).toEqual({
      available: true,
      label: 'merge feature',
      reflogIndex: 1,
      expectedSha: 'before-sha',
    });
  });

  it('reports undo unavailable when HEAD did not change', async () => {
    const result = await service.runOperation({
      operationId: 'merge-noop',
      repositoryId: 'repo-1',
      type: 'merge',
      execute: async () => ({ ok: true }),
    });

    expect(result.undo).toEqual({
      available: false,
      reason: 'This operation did not change HEAD.',
    });
  });

  it('fetches all remotes with prune by default', async () => {
    const result = await service.fetch({ operationId: 'fetch-1', repositoryId: 'repo-1' });

    expect(result.success).toBe(true);
    expect(execCalls).toContainEqual(['fetch', '--all', '--prune']);
    expect(result.data).toEqual({ remote: 'all', pruned: true });
  });

  it('builds pull arguments from strategy, autostash and remote', async () => {
    const result = await service.pull({
      operationId: 'pull-1',
      repositoryId: 'repo-1',
      remote: 'origin',
      strategy: 'ff-only',
      autostash: true,
    });

    expect(result.success).toBe(true);
    expect(execCalls).toContainEqual(['pull', '--ff-only', '--autostash', 'origin']);
    expect(result.data).toMatchObject({
      remote: 'origin',
      strategy: 'ff-only',
      autostashed: true,
    });
  });

  it('pushes with force-with-lease, tags and reports no undo', async () => {
    const result = await service.pushBranch({
      operationId: 'push-1',
      repositoryId: 'repo-1',
      branchName: 'main',
      remote: 'origin',
      forceWithLease: true,
      tags: true,
      setUpstream: false,
    });

    expect(result.success).toBe(true);
    expect(execCalls).toContainEqual(['push', '--force-with-lease', '--tags', 'origin', 'main']);
    expect(result.undo).toEqual({
      available: false,
      reason: 'Undo is not available after pushing to a remote.',
    });
  });

  it('undoes to the expected SHA with a hard reset', async () => {
    (mockRepo as unknown as { listReflog: ReturnType<typeof vi.fn> }).listReflog = vi
      .fn()
      .mockResolvedValue([
        {
          sha: 'new-sha',
          shortSha: 'new-sha',
          index: 0,
          selector: 'HEAD@{0}',
          subject: 'commit: new work',
        },
        {
          sha: 'before-sha',
          shortSha: 'before',
          index: 1,
          selector: 'HEAD@{1}',
          subject: 'reset: moving to HEAD~1',
        },
      ]);

    const result = await service.undo({
      operationId: 'undo-1',
      repositoryId: 'repo-1',
      expectedSha: 'before-sha',
      reflogIndex: 1,
    });

    expect(result.success).toBe(true);
    expect(execCalls).toContainEqual(['reset', '--hard', 'before-sha']);
    expect(result.data).toMatchObject({ targetSha: 'before-sha', reflogIndex: 1 });
  });

  it('refuses undo when the reflog target is gone', async () => {
    (mockRepo as unknown as { listReflog: ReturnType<typeof vi.fn> }).listReflog = vi
      .fn()
      .mockResolvedValue([]);

    const result = await service.undo({
      operationId: 'undo-missing',
      repositoryId: 'repo-1',
      expectedSha: 'gone-sha',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('no longer available in the reflog');
  });

  it('reports ahead/behind status from the current upstream', async () => {
    (mockRepo as unknown as { getRefs: ReturnType<typeof vi.fn> }).getRefs = vi
      .fn()
      .mockResolvedValue({
        currentBranch: 'main',
        localBranches: [{ name: 'main', upstream: 'origin/main' }],
      });
    (mockRepo.exec as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: readonly string[]) => {
        if (args[0] === 'rev-list') {
          return createMockGitResult('3\t2\n');
        }
        return createMockGitResult();
      },
    );

    await expect(service.getSyncStatus('repo-1')).resolves.toEqual({
      repositoryId: 'repo-1',
      currentBranch: 'main',
      upstream: 'origin/main',
      ahead: 3,
      behind: 2,
    });
  });

  it('delegates reflog reads to the repository', async () => {
    const entries = [
      {
        sha: 'abc',
        shortSha: 'abc',
        index: 0,
        selector: 'HEAD@{0}',
        subject: 'commit: test',
      },
    ];
    const listReflog = vi.fn().mockResolvedValue(entries);
    (mockRepo as unknown as { listReflog: typeof listReflog }).listReflog = listReflog;

    await expect(service.listReflog('repo-1', 5)).resolves.toEqual(entries);
    expect(listReflog).toHaveBeenCalledWith(5);
  });

  it('validates remote names and URLs before running git', async () => {
    expect(() =>
      service.addRemote({
        operationId: 'remote-add',
        repositoryId: 'repo-1',
        name: '--bad',
        url: 'https://example.com/repo.git',
      }),
    ).toThrow(/valid remote name/);
    expect(() =>
      service.addRemote({
        operationId: 'remote-add',
        repositoryId: 'repo-1',
        name: 'origin',
        url: '--upload-pack=evil',
      }),
    ).toThrow(/valid remote URL/);
    expect(execCalls.some((args) => args[0] === 'remote')).toBe(false);
  });
});
