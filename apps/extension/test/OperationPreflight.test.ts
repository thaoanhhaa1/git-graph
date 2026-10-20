import { describe, it, expect, vi } from 'vitest';
import { AppErrorCode } from '@git-graph/shared';
import type { GitRepository, GitResult } from '@git-graph/git-core';
import { OperationPreflight } from '../src/operations/OperationPreflight';

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
  execMock: (args: readonly string[]) => Promise<GitResult>,
  isBare = false,
): GitRepository {
  return {
    descriptor: {
      id: 'repo-1',
      name: 'Test Repo',
      rootPath: '/fake/repo',
      gitDir: '/fake/repo/.git',
      isBare,
    },
    rootPath: '/fake/repo',
    gitDir: '/fake/repo/.git',
    isBare,
    id: 'repo-1',
    name: 'Test Repo',
    exec: vi.fn(execMock),
  } as unknown as GitRepository;
}

describe('OperationPreflight', () => {
  const preflight = new OperationPreflight();

  describe('checkWorkingTree', () => {
    it('returns isClean: true when status output is empty', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        return createMockGitResult();
      });

      const status = await preflight.checkWorkingTree(repo);
      expect(status.isClean).toBe(true);
      expect(status.hasStagedChanges).toBe(false);
      expect(status.hasUnstagedChanges).toBe(false);
      expect(status.hasUntrackedFiles).toBe(false);
      expect(status.dirtyFileCount).toBe(0);
      expect(status.modifiedFiles).toEqual([]);
    });

    it('identifies staged, unstaged, and untracked changes', async () => {
      const porcelainOutput = [
        'M  staged.ts',
        ' M unstaged.ts',
        'MM both.ts',
        '?? untracked.ts',
      ].join('\n');

      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult(porcelainOutput);
        }
        return createMockGitResult();
      });

      const status = await preflight.checkWorkingTree(repo);
      expect(status.isClean).toBe(false);
      expect(status.hasStagedChanges).toBe(true);
      expect(status.hasUnstagedChanges).toBe(true);
      expect(status.hasUntrackedFiles).toBe(true);
      expect(status.dirtyFileCount).toBe(4);
      expect(status.modifiedFiles).toEqual(['staged.ts', 'unstaged.ts', 'both.ts', 'untracked.ts']);
    });
  });

  describe('checkHead', () => {
    it('detects attached HEAD on a branch', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        if (args[0] === 'rev-parse') {
          return createMockGitResult('abc1234567890\n');
        }
        return createMockGitResult();
      });

      const head = await preflight.checkHead(repo);
      expect(head.isDetached).toBe(false);
      expect(head.currentBranch).toBe('main');
      expect(head.currentCommitSha).toBe('abc1234567890');
    });

    it('detects detached HEAD when symbolic-ref fails', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('', 'fatal: ref HEAD is not a symbolic ref', 1);
        }
        if (args[0] === 'rev-parse') {
          return createMockGitResult('def9876543210\n');
        }
        return createMockGitResult();
      });

      const head = await preflight.checkHead(repo);
      expect(head.isDetached).toBe(true);
      expect(head.currentBranch).toBeUndefined();
      expect(head.currentCommitSha).toBe('def9876543210');
    });
  });

  describe('validateRefName', () => {
    it('rejects empty and whitespace-only names', async () => {
      const repo = createMockRepo(async () => createMockGitResult());

      const emptyRes = await preflight.validateRefName(repo, '', true);
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.error).toContain('cannot be empty');

      const spaceRes = await preflight.validateRefName(repo, '   ', true);
      expect(spaceRes.valid).toBe(false);
    });

    it('rejects names starting with a dash (option injection defense)', async () => {
      const repo = createMockRepo(async () => createMockGitResult());

      const dashRes = await preflight.validateRefName(repo, '--delete', true);
      expect(dashRes.valid).toBe(false);
      expect(dashRes.error).toContain("cannot start with a dash ('-')");
    });

    it('rejects names containing control characters or whitespace', async () => {
      const repo = createMockRepo(async () => createMockGitResult());

      const spaceRes = await preflight.validateRefName(repo, 'feature branch', true);
      expect(spaceRes.valid).toBe(false);
      expect(spaceRes.error).toContain('cannot contain whitespace');
    });

    it('validates branch names via git check-ref-format', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'check-ref-format') {
          const target = args[2];
          if (target === 'valid/branch-name') {
            return createMockGitResult('valid/branch-name\n');
          }
          return createMockGitResult('', 'fatal: invalid ref', 1);
        }
        return createMockGitResult();
      });

      const validRes = await preflight.validateRefName(repo, 'valid/branch-name', true);
      expect(validRes.valid).toBe(true);

      const invalidRes = await preflight.validateRefName(repo, 'invalid..branch', true);
      expect(invalidRes.valid).toBe(false);
    });
  });

  describe('run', () => {
    it('fails closed when working tree state cannot be determined', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          throw new Error('status unavailable');
        }
        return createMockGitResult();
      });

      const res = await preflight.run(repo, { requireCleanWorktree: true });
      expect(res.passed).toBe(false);
      expect(res.workingTree.isClean).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.error?.message).toContain('Unable to determine the working tree state safely');
    });

    it('fails if repository is bare and disallowBare is true', async () => {
      const repo = createMockRepo(async () => createMockGitResult(), true);

      const res = await preflight.run(repo, { disallowBare: true });
      expect(res.passed).toBe(false);
      expect(res.error?.message).toContain('bare Git repository');
    });

    it('fails if requireCleanWorktree is true and worktree is dirty', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult(' M modified.ts\n');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        return createMockGitResult();
      });

      const res = await preflight.run(repo, { requireCleanWorktree: true });
      expect(res.passed).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.DIRTY_WORKTREE);
      expect(res.error?.message).toContain('uncommitted changes');
    });

    it('fails if allowDetachedHead is false and HEAD is detached', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('', 'fatal', 1);
        }
        return createMockGitResult();
      });

      const res = await preflight.run(repo, { allowDetachedHead: false });
      expect(res.passed).toBe(false);
      expect(res.error?.message).toContain('detached HEAD');
    });

    it('fails if branch already exists when checkBranchMustNotExist is specified', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        if (args[0] === 'show-ref') {
          return createMockGitResult('hash refs/heads/existing-branch\n', '', 0);
        }
        return createMockGitResult();
      });

      const res = await preflight.run(repo, {
        checkBranchMustNotExist: 'existing-branch',
      });
      expect(res.passed).toBe(false);
      expect(res.error?.message).toContain("A branch named 'existing-branch' already exists");
    });

    it('validates tag names in refs/tags and rejects duplicates', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        if (args[0] === 'check-ref-format') {
          return createMockGitResult();
        }
        if (args[0] === 'show-ref') {
          return createMockGitResult('hash refs/tags/v1.0.0\n');
        }
        return createMockGitResult();
      });

      const result = await preflight.run(repo, {
        validateTagName: 'v1.0.0',
        checkTagMustNotExist: 'v1.0.0',
      });

      expect(result.passed).toBe(false);
      expect(result.error?.message).toContain("A tag named 'v1.0.0' already exists");
      expect(repo.exec).toHaveBeenCalledWith(['check-ref-format', 'refs/tags/v1.0.0']);
      expect(repo.exec).toHaveBeenCalledWith([
        'show-ref',
        '--verify',
        '--quiet',
        'refs/tags/v1.0.0',
      ]);
    });

    it('rejects unsafe tag names before checking for duplicates', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        return createMockGitResult();
      });

      const result = await preflight.run(repo, {
        validateTagName: '--delete',
        checkTagMustNotExist: '--delete',
      });

      expect(result.passed).toBe(false);
      expect(result.error?.message).toContain("Tag name cannot start with a dash ('-')");
      expect(repo.exec).not.toHaveBeenCalledWith(expect.arrayContaining(['show-ref']));
    });

    it('passes when all requirements are satisfied', async () => {
      const repo = createMockRepo(async (args) => {
        if (args[0] === 'status') {
          return createMockGitResult('');
        }
        if (args[0] === 'symbolic-ref') {
          return createMockGitResult('main\n');
        }
        if (args[0] === 'rev-parse') {
          return createMockGitResult('hash123\n');
        }
        if (args[0] === 'show-ref') {
          return createMockGitResult('', '', 1); // branch does not exist yet
        }
        if (args[0] === 'check-ref-format') {
          return createMockGitResult('new-feature\n');
        }
        return createMockGitResult();
      });

      const res = await preflight.run(repo, {
        requireCleanWorktree: true,
        allowDetachedHead: true,
        validateBranchName: 'new-feature',
        checkBranchMustNotExist: 'new-feature',
      });

      expect(res.passed).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.workingTree.isClean).toBe(true);
    });
  });
});
