import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppErrorCode,
  type OperationProgressPayload,
  type OperationResultPayload,
} from '@git-graph/shared';
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
    durationMs: 5,
    command: 'git mock',
    args: ['mock'],
  };
}

function createMockRepo(
  id = 'repo-1',
  execMock?: (args: readonly string[]) => Promise<GitResult>,
  isBare = false,
): GitRepository {
  return {
    descriptor: {
      id,
      name: 'Test Repo',
      rootPath: `/fake/${id}`,
      gitDir: `/fake/${id}/.git`,
      isBare,
    },
    rootPath: `/fake/${id}`,
    gitDir: `/fake/${id}/.git`,
    isBare,
    id,
    name: 'Test Repo',
    getRemotes: vi.fn().mockResolvedValue(['origin']),
    exec: vi.fn(execMock || (async () => createMockGitResult())),
  } as unknown as GitRepository;
}

describe('GitOperationService', () => {
  let repositoryManager: RepositoryManager;
  let refreshCoordinator: RefreshCoordinator;
  let service: GitOperationService;
  let mockRepo: GitRepository;
  const logs: string[] = [];

  beforeEach(() => {
    logs.length = 0;
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') {
        return createMockGitResult(''); // clean
      }
      if (args[0] === 'symbolic-ref') {
        return createMockGitResult('main\n');
      }
      if (args[0] === 'rev-parse') {
        return createMockGitResult('commit123\n');
      }
      return createMockGitResult();
    });

    repositoryManager = new RepositoryManager();
    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) => {
      if (id === 'repo-1') {
        return mockRepo;
      }
      return undefined;
    });

    refreshCoordinator = new RefreshCoordinator();

    service = new GitOperationService({
      repositoryManager,
      refreshCoordinator,
      logger: (msg) => logs.push(msg),
    });
  });

  it('executes operation successfully, reporting progress and invalidating cache', async () => {
    const progressEvents: OperationProgressPayload[] = [];
    const resultEvents: OperationResultPayload[] = [];

    service.onDidProgress((e) => progressEvents.push(e));
    service.onDidResult((e) => resultEvents.push(e));

    const invalidateSpy = vi.spyOn(refreshCoordinator, 'invalidate');

    let executed = false;
    const res = await service.runOperation({
      operationId: 'op-checkout-1',
      repositoryId: 'repo-1',
      type: 'checkout',
      preflight: { requireCleanWorktree: true },
      execute: async (ctx) => {
        executed = true;
        ctx.logCommand('git', ['checkout', 'main']);
        return { checkedOut: 'main' };
      },
    });

    expect(executed).toBe(true);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ checkedOut: 'main' });
    expect(invalidateSpy).toHaveBeenCalledWith('repo-1', 'operation-checkout');

    // Progress events
    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    expect(progressEvents[0].requestId).toBe('op-checkout-1');
    expect(progressEvents[progressEvents.length - 1].progress).toBe(1.0);

    // Result event
    expect(resultEvents.length).toBe(1);
    expect(resultEvents[0].requestId).toBe('op-checkout-1');
    expect(resultEvents[0].success).toBe(true);

    // Command logged safely
    expect(logs.some((l) => l.includes('git checkout main'))).toBe(true);
  });

  it('aborts operation when preflight check fails', async () => {
    // Make repo dirty
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') {
        return createMockGitResult(' M dirty.ts\n');
      }
      return createMockGitResult();
    });

    const resultEvents: OperationResultPayload[] = [];
    service.onDidResult((e) => resultEvents.push(e));

    let executed = false;
    const res = await service.runOperation({
      operationId: 'op-dirty-fail',
      repositoryId: 'repo-1',
      type: 'checkout',
      preflight: { requireCleanWorktree: true },
      execute: async () => {
        executed = true;
        return 'should-not-reach';
      },
    });

    expect(executed).toBe(false);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(AppErrorCode.DIRTY_WORKTREE);
    expect(res.actionableMessage).toContain('uncommitted changes');
    expect(resultEvents.length).toBe(1);
    expect(resultEvents[0].success).toBe(false);
  });

  it('captures error during execution, sanitizes stderr, and maps to actionable message', async () => {
    const res = await service.runOperation({
      operationId: 'op-branch-dup',
      repositoryId: 'repo-1',
      type: 'create-branch',
      execute: async (ctx) => {
        ctx.logCommand('git', ['branch', 'feature-1']);
        throw new Error("fatal: A branch named 'feature-1' already exists.");
      },
    });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
    expect(res.actionableMessage).toContain("A branch named 'feature-1' already exists");
  });

  it('handles cancellation properly', async () => {
    let observedSignalAborted = false;

    const opPromise = service.runOperation({
      operationId: 'op-to-cancel',
      repositoryId: 'repo-1',
      type: 'checkout',
      execute: async (ctx) => {
        return new Promise<string>((resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            observedSignalAborted = true;
            reject(new Error('AbortError'));
          });
        });
      },
    });

    // Cancel while running
    await new Promise((r) => setTimeout(r, 10));
    const cancelled = service.cancelOperation('op-to-cancel');
    expect(cancelled).toBe(true);

    const res = await opPromise;
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(AppErrorCode.OPERATION_CANCELLED);
    expect(observedSignalAborted).toBe(true);
  });

  it('returns NOT_A_REPOSITORY if repository is not found', async () => {
    const res = await service.runOperation({
      operationId: 'op-unknown-repo',
      repositoryId: 'non-existent-repo',
      type: 'checkout',
      execute: async () => 'not-called',
    });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(AppErrorCode.NOT_A_REPOSITORY);
  });

  it('checks out an existing local branch with a pathspec separator', async () => {
    const res = await service.checkout({
      operationId: 'checkout-local',
      repositoryId: 'repo-1',
      target: 'refs/heads/feature/safe',
      targetType: 'localBranch',
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      target: 'feature/safe',
      targetType: 'localBranch',
      checkedOutRef: 'refs/heads/feature/safe',
      detachedHead: false,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', 'feature/safe', '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('checks out a confirmed commit in detached HEAD after verifying it', async () => {
    const sha = 'abcdef1234567890abcdef1234567890abcdef12';
    const res = await service.checkout({
      operationId: 'checkout-commit',
      repositoryId: 'repo-1',
      target: sha,
      targetType: 'commit',
      confirmedDetachedHead: true,
    });

    expect(res.success).toBe(true);
    expect(res.data?.detachedHead).toBe(true);
    expect(res.data?.warning).toContain('detach HEAD');
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', '--detach', sha, '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('requires explicit detached HEAD confirmation before checkout', async () => {
    const res = await service.checkout({
      operationId: 'checkout-unconfirmed-commit',
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      targetType: 'commit',
    });

    expect(res.success).toBe(false);
    expect(res.actionableMessage).toContain('detach HEAD');
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout']),
      expect.anything(),
    );
  });

  it('checks out a confirmed tag via its exact tag ref', async () => {
    const res = await service.checkout({
      operationId: 'checkout-tag',
      repositoryId: 'repo-1',
      target: 'refs/tags/v1.0.0',
      targetType: 'tag',
      confirmedDetachedHead: true,
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      targetType: 'tag',
      checkedOutRef: 'refs/tags/v1.0.0',
      detachedHead: true,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rev-parse', '--verify', '--end-of-options', 'refs/tags/v1.0.0^{commit}'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', '--detach', 'refs/tags/v1.0.0', '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('creates a confirmed local tracking branch for an exact remote ref', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('commit123\n');
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref' && args[3] === 'refs/heads/feature/safe') {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'show-ref' && args[3] === 'refs/remotes/origin/feature/safe') {
        return createMockGitResult();
      }
      return createMockGitResult();
    });

    const res = await service.checkout({
      operationId: 'checkout-remote',
      repositoryId: 'repo-1',
      target: 'origin/feature/safe',
      targetType: 'remoteBranch',
      localBranchName: 'feature/safe',
      confirmedRemoteTracking: true,
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      localBranchName: 'feature/safe',
      upstream: 'origin/feature/safe',
      detachedHead: false,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', '--track', '-b', 'feature/safe', 'refs/remotes/origin/feature/safe', '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('checks out and fast-forwards existing local branch when checking out remote branch', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('refs/heads/main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('commit123\n');
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref')
        return createMockGitResult('commit-sha refs/heads/feature/existing\n', '', 0);
      return createMockGitResult();
    });
    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) => {
      if (id === 'repo-1') return mockRepo;
      return undefined;
    });

    const res = await service.checkout({
      operationId: 'checkout-remote-existing',
      repositoryId: 'repo-1',
      target: 'origin/feature/existing',
      targetType: 'remoteBranch',
      localBranchName: 'feature/existing',
      confirmedRemoteTracking: true,
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      localBranchName: 'feature/existing',
      upstream: 'origin/feature/existing',
      detachedHead: false,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', 'feature/existing', '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--ff-only', 'refs/remotes/origin/feature/existing'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('blocks checkout when the working tree is dirty without stashing', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult(' M src/dirty.ts\n');
      return createMockGitResult();
    });

    const res = await service.checkout({
      operationId: 'checkout-dirty',
      repositoryId: 'repo-1',
      target: 'main',
      targetType: 'localBranch',
    });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(AppErrorCode.DIRTY_WORKTREE);
    expect(res.actionableMessage).toContain('commit, stash, or discard');
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['stash']),
      expect.anything(),
    );
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout']),
      expect.anything(),
    );
  });

  it('rejects option-like local branch targets before checkout', async () => {
    const res = await service.checkout({
      operationId: 'checkout-injection',
      repositoryId: 'repo-1',
      target: '--force',
      targetType: 'localBranch',
    });

    expect(res.success).toBe(false);
    expect(res.actionableMessage).toContain('cannot start with a dash');
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout']),
      expect.anything(),
    );
  });

  it('creates a branch from a resolved start point without checking it out', async () => {
    const commitSha = 'abcdef1234567890abcdef1234567890abcdef12';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult(' M src/dirty.ts\n');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return createMockGitResult('head123\n');
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${commitSha}\n`);
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const res = await service.createBranch({
      operationId: 'branch-create-only',
      repositoryId: 'repo-1',
      name: 'feature/safe',
      startPoint: 'refs/tags/v1.0.0',
      checkout: false,
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      name: 'feature/safe',
      branchRef: 'refs/heads/feature/safe',
      startPoint: 'refs/tags/v1.0.0',
      commitSha,
      checkedOut: false,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(['check-ref-format', '--branch', 'feature/safe']);
    expect(mockRepo.exec).toHaveBeenCalledWith([
      'show-ref',
      '--verify',
      '--quiet',
      'refs/heads/feature/safe',
    ]);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rev-parse', '--verify', '--end-of-options', 'refs/tags/v1.0.0^{commit}'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['branch', '--', 'feature/safe', commitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout']),
      expect.anything(),
    );
  });

  it('creates and checks out a branch when requested', async () => {
    const commitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return createMockGitResult('head123\n');
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${commitSha}\n`);
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const res = await service.createBranch({
      operationId: 'branch-create-checkout',
      repositoryId: 'repo-1',
      name: 'feature/checked-out',
      startPoint: commitSha,
      checkout: true,
    });

    expect(res.success).toBe(true);
    expect(res.data?.checkedOut).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', '-b', 'feature/checked-out', commitSha, '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('creates and checks out a branch when the working tree has uncommitted changes', async () => {
    const commitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status')
        return createMockGitResult(' M src/modified.ts\n?? untracked.txt\n');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return createMockGitResult('head123\n');
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${commitSha}\n`);
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const res = await service.createBranch({
      operationId: 'branch-create-checkout-dirty',
      repositoryId: 'repo-1',
      name: 'feature/with-uncommitted-changes',
      startPoint: commitSha,
      checkout: true,
    });

    expect(res.success).toBe(true);
    expect(res.data?.checkedOut).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['checkout', '-b', 'feature/with-uncommitted-changes', commitSha, '--'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects invalid or duplicate branch names before creation', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'check-ref-format') {
        return args[2] === 'feature duplicate'
          ? createMockGitResult('', 'invalid', 1)
          : createMockGitResult(`${args[2]}\n`);
      }
      if (args[0] === 'show-ref') return createMockGitResult('hash refs/heads/existing\n');
      return createMockGitResult();
    });

    const empty = await service.createBranch({
      operationId: 'branch-create-empty',
      repositoryId: 'repo-1',
      name: '   ',
      startPoint: 'HEAD',
    });
    expect(empty.success).toBe(false);
    expect(empty.actionableMessage).toContain('name cannot be empty');

    const invalid = await service.createBranch({
      operationId: 'branch-create-invalid',
      repositoryId: 'repo-1',
      name: 'feature duplicate',
      startPoint: 'HEAD',
    });
    expect(invalid.success).toBe(false);
    expect(invalid.actionableMessage).toContain('cannot contain whitespace');

    const duplicate = await service.createBranch({
      operationId: 'branch-create-duplicate',
      repositoryId: 'repo-1',
      name: 'existing',
      startPoint: 'HEAD',
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.actionableMessage).toContain("A branch named 'existing' already exists");
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['branch']),
      expect.anything(),
    );
  });

  it('rejects a start point that does not resolve to a commit', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return createMockGitResult('head123\n');
      }
      if (args[0] === 'rev-parse') return createMockGitResult('', 'unknown revision', 1);
      if (args[0] === 'check-ref-format') return createMockGitResult(`${args[2]}\n`);
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const res = await service.createBranch({
      operationId: 'branch-create-missing-start',
      repositoryId: 'repo-1',
      name: 'feature/safe',
      startPoint: '--force',
    });

    expect(res.success).toBe(false);
    expect(res.actionableMessage).toContain("Start point '--force' does not resolve to a commit");
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rev-parse', '--verify', '--end-of-options', '--force^{commit}'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['branch']),
      expect.anything(),
    );
  });

  it('creates a lightweight tag at a resolved commit target', async () => {
    const commitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return createMockGitResult('head123\n');
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${commitSha}\n`);
      if (args[0] === 'check-ref-format') return createMockGitResult();
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const result = await service.createTag({
      operationId: 'tag-create-1',
      repositoryId: 'repo-1',
      name: 'release/v1.0.0',
      target: 'abcdef1234567',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'release/v1.0.0',
      tagRef: 'refs/tags/release/v1.0.0',
      target: 'abcdef1234567',
      commitSha,
      tagType: 'lightweight',
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(['check-ref-format', 'refs/tags/release/v1.0.0']);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rev-parse', '--verify', '--end-of-options', 'abcdef1234567^{commit}'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['tag', '--', 'release/v1.0.0', commitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects invalid and duplicate tag names before creation', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'check-ref-format') return createMockGitResult();
      if (args[0] === 'show-ref') return createMockGitResult('hash refs/tags/v1.0.0\n');
      return createMockGitResult();
    });

    const invalid = await service.createTag({
      operationId: 'tag-create-invalid',
      repositoryId: 'repo-1',
      name: '--force',
      target: 'HEAD',
    });
    expect(invalid.success).toBe(false);
    expect(invalid.actionableMessage).toContain("Tag name cannot start with a dash ('-')");

    const duplicate = await service.createTag({
      operationId: 'tag-create-duplicate',
      repositoryId: 'repo-1',
      name: 'v1.0.0',
      target: 'HEAD',
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.actionableMessage).toContain("A tag named 'v1.0.0' already exists");
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['tag']),
      expect.anything(),
    );
  });

  it('creates annotated tags and optionally pushes them to a remote', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'check-ref-format') return createMockGitResult();
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const result = await service.createTag({
      operationId: 'tag-create-annotated',
      repositoryId: 'repo-1',
      name: 'v2.0.0',
      target: 'HEAD',
      tagType: 'annotated',
      message: 'Version 2',
      pushToRemote: true,
      remote: 'upstream',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      name: 'v2.0.0',
      tagType: 'annotated',
      message: 'Version 2',
      pushedToRemote: true,
      remote: 'upstream',
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['tag', '-a', '-m', 'Version 2', '--', 'v2.0.0', 'head123'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['push', 'upstream', 'refs/tags/v2.0.0'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects annotated tags without a message', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'check-ref-format') return createMockGitResult();
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const result = await service.createTag({
      operationId: 'tag-create-annotated-no-message',
      repositoryId: 'repo-1',
      name: 'v2.0.1',
      target: 'HEAD',
      tagType: 'annotated',
    });

    expect(result.success).toBe(false);
    expect(result.actionableMessage).toContain('An annotated tag requires a message');
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['tag']),
      expect.anything(),
    );
  });

  it('deletes a local tag and optionally removes it from a remote', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'show-ref') return createMockGitResult('tagsha123 refs/tags/v1.0.0\n');
      return createMockGitResult();
    });

    const result = await service.deleteTag({
      operationId: 'tag-delete-1',
      repositoryId: 'repo-1',
      tagName: 'refs/tags/v1.0.0',
      deleteOnRemote: true,
      remote: 'origin',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      tagName: 'v1.0.0',
      deletedLocal: true,
      deletedRemote: true,
      remote: 'origin',
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['tag', '--delete', '--', 'v1.0.0'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['push', 'origin', '--delete', 'refs/tags/v1.0.0'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects deleting a tag that does not exist', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'show-ref') return createMockGitResult('', '', 1);
      return createMockGitResult();
    });

    const result = await service.deleteTag({
      operationId: 'tag-delete-missing',
      repositoryId: 'repo-1',
      tagName: 'v9.9.9',
    });

    expect(result.success).toBe(false);
    expect(result.actionableMessage).toContain("Tag 'v9.9.9' does not exist");
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['tag', '--delete']),
      expect.anything(),
    );
  });

  it('merges a resolved target into the current branch with explicit fast-forward policy', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      return createMockGitResult();
    });

    const result = await service.merge({
      operationId: 'merge-1',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'no-ff',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      target: 'feature',
      targetCommitSha,
      currentBranch: 'main',
      fastForwardMode: 'no-ff',
      mergeState: { inProgress: false, unmergedFiles: [] },
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--no-ff', '--no-edit', '--end-of-options', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['update-index', '-q', '--refresh'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('squash merges a resolved target into the current branch with --squash', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      return createMockGitResult();
    });

    const result = await service.merge({
      operationId: 'merge-squash-1',
      repositoryId: 'repo-1',
      target: 'feature',
      squash: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      target: 'feature',
      targetCommitSha,
      currentBranch: 'main',
      squash: true,
      mergeState: { inProgress: false, unmergedFiles: [] },
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--squash', '--end-of-options', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('merges with --ff-only when fast-forward only is requested', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      return createMockGitResult();
    });

    const result = await service.merge({
      operationId: 'merge-ff-only',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'ff-only',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      target: 'feature',
      targetCommitSha,
      fastForwardMode: 'ff-only',
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--ff-only', '--no-edit', '--end-of-options', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('omits --no-edit and passes --no-commit when noCommit is requested', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      return createMockGitResult();
    });

    const result = await service.merge({
      operationId: 'merge-no-commit',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'no-ff',
      noCommit: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      target: 'feature',
      noCommit: true,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--no-ff', '--no-commit', '--end-of-options', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['--no-edit']),
      expect.anything(),
    );
  });

  it('rebases with --ignore-date when requested', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('@{upstream}')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      return createMockGitResult();
    });

    const result = await service.rebase({
      operationId: 'rebase-ignore-date',
      repositoryId: 'repo-1',
      target: 'main',
      ignoreDate: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      target: 'main',
      targetCommitSha,
      ignoreDate: true,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['rebase', '--ignore-date', '--', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('blocks merge when the working tree is dirty or HEAD is detached', async () => {
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult(' M src/dirty.ts\n');
      return createMockGitResult();
    });

    const dirty = await service.merge({
      operationId: 'merge-dirty',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'ff',
    });
    expect(dirty.success).toBe(false);
    expect(dirty.error?.code).toBe(AppErrorCode.DIRTY_WORKTREE);
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['merge']),
      expect.anything(),
    );

    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('', '', 1);
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      return createMockGitResult();
    });

    const detached = await service.merge({
      operationId: 'merge-detached',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'ff',
    });
    expect(detached.success).toBe(false);
    expect(detached.actionableMessage).toContain('detached HEAD');
  });

  it('reports merge conflict state without resolving conflicts automatically', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult(`${targetCommitSha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      if (args[0] === 'merge') return createMockGitResult('', 'CONFLICT (content): file.txt', 1);
      if (args[0] === 'diff') return createMockGitResult('file.txt\nsrc/app.ts\n');
      return createMockGitResult();
    });

    const result = await service.merge({
      operationId: 'merge-conflict',
      repositoryId: 'repo-1',
      target: 'feature',
      fastForwardMode: 'ff',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Merge stopped with conflicts');
    expect(result.error?.details).toMatchObject({
      mergeState: {
        inProgress: true,
        targetSha: targetCommitSha,
        unmergedFiles: ['file.txt', 'src/app.ts'],
      },
      target: 'feature',
      currentBranch: 'main',
    });
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout', '--ours']),
      expect.anything(),
    );
  });

  it('aborts an in-progress merge through the operation framework', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult(`${targetCommitSha}\n`);
      }
      if (args[0] === 'diff') return createMockGitResult('file.txt\n');
      return createMockGitResult();
    });

    const result = await service.abortMerge({
      operationId: 'merge-abort-1',
      repositoryId: 'repo-1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      aborted: true,
      mergeStateBeforeAbort: {
        inProgress: true,
        targetSha: targetCommitSha,
        unmergedFiles: ['file.txt'],
      },
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['merge', '--abort'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('reports squash merge conflict even without MERGE_HEAD and allows abort via reset --merge', async () => {
    const targetCommitSha = '1234567890abcdef1234567890abcdef12345678';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
        return createMockGitResult('', '', 1); // MERGE_HEAD does not exist in squash merge
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${targetCommitSha}\n`);
      if (args[0] === 'merge' && args.includes('--squash')) {
        return createMockGitResult('', 'CONFLICT (content): squash-file.txt', 1);
      }
      if (args[0] === 'merge' && args.includes('--abort')) {
        return createMockGitResult(
          '',
          'fatal: There is no merge to abort (MERGE_HEAD missing)',
          128,
        );
      }
      if (args[0] === 'reset' && args.includes('--merge')) {
        return createMockGitResult('');
      }
      if (args[0] === 'diff') return createMockGitResult('squash-file.txt\n');
      return createMockGitResult();
    });

    const mergeResult = await service.merge({
      operationId: 'merge-squash-conflict',
      repositoryId: 'repo-1',
      target: 'feature',
      squash: true,
    });

    expect(mergeResult.success).toBe(false);
    expect(mergeResult.error?.message).toContain('Merge stopped with conflicts in 1 file(s)');
    expect(mergeResult.error?.details).toMatchObject({
      mergeState: {
        inProgress: true,
        unmergedFiles: ['squash-file.txt'],
      },
      target: 'feature',
      currentBranch: 'main',
    });

    const abortResult = await service.abortMerge({
      operationId: 'merge-squash-abort',
      repositoryId: 'repo-1',
    });

    expect(abortResult.success).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['reset', '--merge'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('squash merges only exclusive commits of a branch into current branch with exclusive option', async () => {
    const targetCommitSha = '1111111111111111111111111111111111111111';
    const commit2Sha = '2222222222222222222222222222222222222222';
    const baseCommitSha = '0000000000000000000000000000000000000000';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return createMockGitResult('head123\n');
      if (args[0] === 'for-each-ref')
        return createMockGitResult(
          'refs/heads/main\nrefs/heads/test-dev\nrefs/heads/test-branch\nrefs/remotes/origin/Development\n',
        );
      if (args[0] === 'merge-base' && args.includes('refs/remotes/origin/Development')) {
        return createMockGitResult(`${baseCommitSha}\n`);
      }
      if (args[0] === 'rev-list' && args.includes('--count')) {
        return createMockGitResult('2\n');
      }
      if (args[0] === 'rev-list' && args.includes('--parents')) {
        return createMockGitResult(`${args[args.length - 1]} parent123\n`);
      }
      if (args[0] === 'rev-list' && args.includes(`${baseCommitSha}..${commit2Sha}`)) {
        return createMockGitResult(`${targetCommitSha}\n${commit2Sha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult(`${commit2Sha}\n`);
      return createMockGitResult();
    });

    const mergeResult = await service.merge({
      operationId: 'merge-squash-exclusive',
      repositoryId: 'repo-1',
      target: 'test-branch',
      targetBranch: 'test-branch',
      squash: true,
      exclusive: true,
    });

    expect(mergeResult.success).toBe(true);
    expect(mergeResult.data).toMatchObject({
      target: 'test-branch',
      currentBranch: 'main',
      squash: true,
      exclusive: true,
      squashedCommits: [targetCommitSha, commit2Sha],
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '-n', '--end-of-options', targetCommitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '-n', '--end-of-options', commit2Sha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('cherry-picks one resolved commit and reports clean sequencer state', async () => {
    const commitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args.includes('CHERRY_PICK_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && args.includes('REVERT_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('feature-commit')) {
        return createMockGitResult(`${commitSha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'rev-list') return createMockGitResult(`${commitSha} parent1\n`);
      return createMockGitResult();
    });

    const result = await service.cherryPick({
      operationId: 'cherry-pick-1',
      repositoryId: 'repo-1',
      commit: 'feature-commit',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      commit: 'feature-commit',
      commitSha,
      operationState: { inProgress: false, unmergedFiles: [] },
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '--no-edit', '--end-of-options', commitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('cherry-picks commit without committing when noCommit is set and supports range', async () => {
    const commitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'rev-parse' && args.includes('CHERRY_PICK_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && args.includes('REVERT_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('feature-commit')) {
        return createMockGitResult(`${commitSha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'rev-list') return createMockGitResult(`${commitSha} parent1\n`);
      return createMockGitResult();
    });

    const result = await service.cherryPick({
      operationId: 'cherry-pick-no-commit',
      repositoryId: 'repo-1',
      commit: 'feature-commit',
      noCommit: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      commit: 'feature-commit',
      commitSha,
      noCommit: true,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '-n', '--end-of-options', commitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const rangeResult = await service.cherryPick({
      operationId: 'cherry-pick-range',
      repositoryId: 'repo-1',
      commit: 'test-dev..test-branch',
      noCommit: true,
    });

    expect(rangeResult.success).toBe(true);
    expect(rangeResult.data).toMatchObject({
      commit: 'test-dev..test-branch',
      commitSha: 'test-dev..test-branch',
      noCommit: true,
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '-n', '--end-of-options', 'test-dev..test-branch'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('requires a mainline parent before cherry-picking or reverting merge commits', async () => {
    const commitSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('merge-commit')) {
        return createMockGitResult(`${commitSha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult('', '', 1);
      if (args[0] === 'rev-list') return createMockGitResult(`${commitSha} parent1 parent2\n`);
      return createMockGitResult();
    });

    const cherryPick = await service.cherryPick({
      operationId: 'cherry-pick-merge',
      repositoryId: 'repo-1',
      commit: 'merge-commit',
    });
    expect(cherryPick.success).toBe(false);
    expect(cherryPick.error?.message).toContain('merge commit');
    expect(cherryPick.error?.details).toMatchObject({ commitSha, parentCount: 2 });

    const revert = await service.revert({
      operationId: 'revert-merge',
      repositoryId: 'repo-1',
      commit: 'merge-commit',
      mainlineParent: 2,
    });
    expect(revert.success).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['revert', '-m', '2', '--no-edit', '--end-of-options', commitSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('reports cherry-pick conflict state and supports abort through shared sequencer flow', async () => {
    const commitSha = 'cccccccccccccccccccccccccccccccccccccccc';
    let cherryPickInProgress = false;
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'status') return createMockGitResult('');
      if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
      if (args[0] === 'rev-parse' && args.includes('CHERRY_PICK_HEAD')) {
        return cherryPickInProgress
          ? createMockGitResult(`${commitSha}\n`)
          : createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && args.includes('REVERT_HEAD')) {
        return createMockGitResult('', '', 1);
      }
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('conflict-commit')) {
        return createMockGitResult(`${commitSha}\n`);
      }
      if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
      if (args[0] === 'rev-list') return createMockGitResult(`${commitSha} parent1\n`);
      if (args[0] === 'cherry-pick' && args.includes('--end-of-options')) {
        cherryPickInProgress = true;
        return createMockGitResult('', 'CONFLICT (content): file.txt', 1);
      }
      if (args[0] === 'cherry-pick' && args.includes('--abort')) {
        cherryPickInProgress = false;
        return createMockGitResult();
      }
      if (args[0] === 'diff') return createMockGitResult('file.txt\n');
      return createMockGitResult();
    });

    const conflict = await service.cherryPick({
      operationId: 'cherry-pick-conflict',
      repositoryId: 'repo-1',
      commit: 'conflict-commit',
    });
    expect(conflict.success).toBe(false);
    expect(conflict.error?.message).toContain('Cherry-pick stopped with conflicts');
    expect(conflict.error?.details).toMatchObject({
      operationState: {
        inProgress: true,
        operation: 'cherry-pick',
        targetSha: commitSha,
        unmergedFiles: ['file.txt'],
      },
    });

    const aborted = await service.abortCherryPick({
      operationId: 'cherry-pick-abort',
      repositoryId: 'repo-1',
    });
    expect(aborted.success).toBe(true);
    expect(aborted.data).toMatchObject({
      operation: 'cherry-pick',
      action: 'abort',
      operationStateBeforeAction: { inProgress: true, operation: 'cherry-pick' },
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['cherry-pick', '--abort'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('executes soft reset to a resolved target commit', async () => {
    const targetSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('HEAD~1')) {
        return createMockGitResult(`${targetSha}\n`);
      }
      return createMockGitResult();
    });

    const result = await service.reset({
      operationId: 'reset-soft',
      repositoryId: 'repo-1',
      target: 'HEAD~1',
      mode: 'soft',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      target: 'HEAD~1',
      targetCommitSha: targetSha,
      mode: 'soft',
    });
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['reset', '--soft', targetSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('requires explicit confirmation before hard reset', async () => {
    const targetSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    mockRepo = createMockRepo('repo-1', async (args) => {
      if (args[0] === 'rev-parse' && String(args.at(-1)).includes('main')) {
        return createMockGitResult(`${targetSha}\n`);
      }
      return createMockGitResult();
    });

    const unconfirmed = await service.reset({
      operationId: 'reset-hard-unconfirmed',
      repositoryId: 'repo-1',
      target: 'main',
      mode: 'hard',
    });

    expect(unconfirmed.success).toBe(false);
    expect(unconfirmed.actionableMessage).toContain('requires explicit modal confirmation');
    expect(mockRepo.exec).not.toHaveBeenCalledWith(
      ['reset', '--hard', targetSha],
      expect.anything(),
    );

    const confirmed = await service.reset({
      operationId: 'reset-hard-confirmed',
      repositoryId: 'repo-1',
      target: 'main',
      mode: 'hard',
      confirmedHardReset: true,
    });

    expect(confirmed.success).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['reset', '--hard', targetSha],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('executes git fetch --all --prune by default and reports success', async () => {
    const result = await service.fetch({
      operationId: 'fetch-all-test',
      repositoryId: 'repo-1',
    });

    expect(result.success).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['fetch', '--all', '--prune'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('executes git fetch for specific remote with custom prune option', async () => {
    const result = await service.fetch({
      operationId: 'fetch-upstream-test',
      repositoryId: 'repo-1',
      remote: 'upstream',
      prune: false,
    });

    expect(result.success).toBe(true);
    expect(mockRepo.exec).toHaveBeenCalledWith(
      ['fetch', 'upstream'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fails with actionable message when no remotes are configured', async () => {
    vi.spyOn(mockRepo, 'getRemotes').mockResolvedValue([]);

    const result = await service.fetch({
      operationId: 'fetch-no-remote',
      repositoryId: 'repo-1',
    });

    expect(result.success).toBe(false);
    expect(result.actionableMessage).toContain('No remote repositories configured');
  });

  describe('deleteBranch', () => {
    it('deletes local branch with -d and reports success', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'show-ref') return createMockGitResult('hash refs/heads/feature/old\n');
        if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
        return createMockGitResult();
      });

      const result = await service.deleteBranch({
        operationId: 'del-1',
        repositoryId: 'repo-1',
        branchName: 'feature/old',
        forceDelete: false,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        branchName: 'feature/old',
        forceDelete: false,
        deletedLocal: true,
        deletedRemote: false,
        remote: undefined,
      });
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['branch', '-d', 'feature/old'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('uses -D when forceDelete is true', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'show-ref') return createMockGitResult('hash refs/heads/unmerged\n');
        if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
        return createMockGitResult();
      });

      const result = await service.deleteBranch({
        operationId: 'del-force',
        repositoryId: 'repo-1',
        branchName: 'unmerged',
        forceDelete: true,
      });

      expect(result.success).toBe(true);
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['branch', '-D', 'unmerged'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('deletes on remote when deleteOnRemote is true', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'show-ref') return createMockGitResult('hash refs/heads/feature\n');
        if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
        return createMockGitResult();
      });

      const result = await service.deleteBranch({
        operationId: 'del-remote',
        repositoryId: 'repo-1',
        branchName: 'origin/feature',
        deleteOnRemote: true,
      });

      expect(result.success).toBe(true);
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['push', 'origin', '--delete', 'feature'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['fetch', 'origin', '--prune'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('rejects deleting currently checked out branch', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'show-ref') return createMockGitResult('hash refs/heads/main\n');
        if (args[0] === 'symbolic-ref') return createMockGitResult('main\n');
        return createMockGitResult();
      });

      const result = await service.deleteBranch({
        operationId: 'del-current',
        repositoryId: 'repo-1',
        branchName: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.actionableMessage).toContain(
        "Cannot delete branch 'main' because it is currently checked out",
      );
    });
  });

  describe('worktree and stash operations', () => {
    it('stages and unstages selected paths', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'status') return createMockGitResult('');
        if (args[0] === 'rev-parse') return createMockGitResult('head123\n');
        return createMockGitResult();
      });

      const staged = await service.stageWorktree({
        operationId: 'stage-1',
        repositoryId: 'repo-1',
        paths: ['src/a.ts', ' src/b.ts '],
      });
      expect(staged.success).toBe(true);
      expect(staged.data).toEqual({ paths: ['src/a.ts', 'src/b.ts'], all: false });
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['add', '-A', '--', 'src/a.ts', 'src/b.ts'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      const unstaged = await service.unstageWorktree({
        operationId: 'unstage-1',
        repositoryId: 'repo-1',
        paths: ['src/a.ts'],
      });
      expect(unstaged.success).toBe(true);
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['reset', '-q', 'HEAD', '--', 'src/a.ts'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('unstages all paths via git rm --cached when HEAD is unborn', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'status') return createMockGitResult('');
        if (args[0] === 'rev-parse') return createMockGitResult('', 'fatal: no HEAD', 128);
        return createMockGitResult();
      });

      const result = await service.unstageWorktree({
        operationId: 'unstage-unborn',
        repositoryId: 'repo-1',
        paths: [],
        all: true,
      });

      expect(result.success).toBe(true);
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', '.'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('rejects staging with no paths and discarding with no paths', async () => {
      const stageResult = await service.stageWorktree({
        operationId: 'stage-empty',
        repositoryId: 'repo-1',
        paths: [],
      });
      expect(stageResult.success).toBe(false);
      expect(stageResult.actionableMessage).toContain('No paths were provided to stage');

      const discardResult = await service.discardWorktree({
        operationId: 'discard-empty',
        repositoryId: 'repo-1',
        paths: [],
      });
      expect(discardResult.success).toBe(false);
      expect(discardResult.actionableMessage).toContain('No paths were provided to discard');
    });

    it('discards all changes through the repository worktree query', async () => {
      const discardSpy = vi.fn().mockResolvedValue(undefined);
      (mockRepo as unknown as { discardWorktree: typeof discardSpy }).discardWorktree = discardSpy;

      const result = await service.discardWorktree({
        operationId: 'discard-all',
        repositoryId: 'repo-1',
        paths: [],
        all: true,
      });

      expect(result.success).toBe(true);
      expect(discardSpy).toHaveBeenCalledWith({ paths: [], all: true });
    });

    it('creates a commit with message, description, and amend flag', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'status') return createMockGitResult('');
        if (args[0] === 'diff') return createMockGitResult('src/a.ts\n');
        if (args[0] === 'rev-parse') return createMockGitResult('newsha123\n');
        if (args[0] === 'log') return createMockGitResult('feat: commit from worktree\n');
        return createMockGitResult();
      });

      const result = await service.createCommit({
        operationId: 'commit-1',
        repositoryId: 'repo-1',
        message: '  feat: commit from worktree  ',
        description: 'Body',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        sha: 'newsha123',
        subject: 'feat: commit from worktree',
        amended: false,
      });
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['commit', '-m', 'feat: commit from worktree', '-m', 'Body'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('rejects commits with an empty message or no staged changes', async () => {
      const emptyMessage = await service.createCommit({
        operationId: 'commit-empty',
        repositoryId: 'repo-1',
        message: '   ',
      });
      expect(emptyMessage.success).toBe(false);
      expect(emptyMessage.actionableMessage).toContain('Commit message cannot be empty');

      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'status') return createMockGitResult('');
        if (args[0] === 'diff') return createMockGitResult('');
        return createMockGitResult();
      });
      const noStaged = await service.createCommit({
        operationId: 'commit-no-staged',
        repositoryId: 'repo-1',
        message: 'feat: nothing',
      });
      expect(noStaged.success).toBe(false);
      expect(noStaged.actionableMessage).toContain('no staged changes');
    });

    it('skips the staged-changes check when amending', async () => {
      mockRepo = createMockRepo('repo-1', async (args) => {
        if (args[0] === 'status') return createMockGitResult('');
        if (args[0] === 'rev-parse') return createMockGitResult('amendsha\n');
        if (args[0] === 'log') return createMockGitResult('feat: amended\n');
        return createMockGitResult();
      });

      const result = await service.createCommit({
        operationId: 'commit-amend',
        repositoryId: 'repo-1',
        message: 'feat: amended',
        amend: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ amended: true, sha: 'amendsha' });
      expect(mockRepo.exec).toHaveBeenCalledWith(
        ['commit', '-m', 'feat: amended', '--amend'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('saves, pops, applies, and drops stashes with a validated index', async () => {
      const saveSpy = vi.fn().mockResolvedValue(undefined);
      (mockRepo as unknown as { saveStash: typeof saveSpy }).saveStash = saveSpy;

      const saved = await service.saveStash({
        operationId: 'stash-save',
        repositoryId: 'repo-1',
        message: ' wip ',
        includeUntracked: true,
        keepIndex: true,
      });
      expect(saved.success).toBe(true);
      expect(saveSpy).toHaveBeenCalledWith({
        message: 'wip',
        includeUntracked: true,
        keepIndex: true,
      });

      for (const [action, method] of [
        ['pop', 'popStash'],
        ['apply', 'applyStash'],
        ['drop', 'dropStash'],
      ] as const) {
        const result = await (service[method] as typeof service.popStash)({
          operationId: `stash-${action}`,
          repositoryId: 'repo-1',
          index: 2,
        });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ action, index: 2, ref: 'stash@{2}' });
        expect(mockRepo.exec).toHaveBeenCalledWith(
          ['stash', action, 'stash@{2}'],
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      }

      const invalid = await service.dropStash({
        operationId: 'stash-invalid',
        repositoryId: 'repo-1',
        index: -1,
      });
      expect(invalid.success).toBe(false);
      expect(invalid.actionableMessage).toContain('Invalid stash index');
    });
  });

  describe('worktree operations', () => {
    it('creates a linked worktree through the repository facade', async () => {
      const addWorktree = vi.fn().mockResolvedValue([]);
      (mockRepo as unknown as { addWorktree: typeof addWorktree }).addWorktree = addWorktree;

      const result = await service.addGitWorktree({
        operationId: 'worktree-add',
        repositoryId: 'repo-1',
        path: ' ../linked ',
        branch: ' feature ',
        newBranch: ' feature-2 ',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        path: '../linked',
        branch: 'feature',
        newBranch: 'feature-2',
      });
      expect(addWorktree).toHaveBeenCalledWith({
        path: '../linked',
        branch: 'feature',
        newBranch: 'feature-2',
      });
    });

    it('removes a linked worktree with force enabled', async () => {
      const removeWorktree = vi.fn().mockResolvedValue([]);
      (mockRepo as unknown as { removeWorktree: typeof removeWorktree }).removeWorktree =
        removeWorktree;

      const result = await service.removeGitWorktree({
        operationId: 'worktree-remove',
        repositoryId: 'repo-1',
        path: '/repos/linked',
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ path: '/repos/linked', force: true });
      expect(removeWorktree).toHaveBeenCalledWith('/repos/linked', true);
    });

    it('rejects an empty worktree path before executing git', async () => {
      const result = await service.addGitWorktree({
        operationId: 'worktree-add-empty',
        repositoryId: 'repo-1',
        path: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.actionableMessage).toContain('Worktree path is required.');
    });
  });
});
