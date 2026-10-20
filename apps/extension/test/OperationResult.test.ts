import { describe, it, expect } from 'vitest';
import { AppErrorCode } from '@git-graph/shared';
import {
  sanitizeStderr,
  sanitizeGitCommandMetadata,
  mapErrorToActionableMessage,
  createOperationSuccessResult,
  createOperationFailureResult,
} from '../src/operations/OperationResult';

describe('OperationResult', () => {
  describe('sanitizeStderr', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeStderr('')).toBe('');
    });

    it('strips ANSI color escape sequences', () => {
      const raw = '\u001b[31mError:\u001b[0m fatal: uncommitted changes\u001b[32m[ok]\u001b[0m';
      const clean = sanitizeStderr(raw);
      expect(clean).toBe('Error: fatal: uncommitted changes[ok]');
    });

    it('masks URLs with embedded credentials', () => {
      const raw =
        'fatal: unable to access "https://alice:supersecret@github.com/org/repo.git/": Failed';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('supersecret');
      expect(clean).toContain('https://alice:***@github.com/org/repo.git/');
    });

    it('masks GitHub personal access tokens', () => {
      const raw = 'remote: auth failed for ghp_abcdefghijklmnopqrstuvwxyz0123456789 in request';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
      expect(clean).toContain('ghp_***');
    });

    it('masks GitHub fine-grained personal access tokens', () => {
      const raw = 'remote: token github_pat_11AABCDEF0123456789012 invalid';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('github_pat_11AABCDEF0123456789012');
      expect(clean).toContain('github_pat_***');
    });

    it('masks GitLab personal access tokens', () => {
      const raw = 'remote: glpat-abcdefghijklmnopqrst12 invalid token';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('glpat-abcdefghijklmnopqrst12');
      expect(clean).toContain('glpat-***');
    });

    it('masks Bearer tokens', () => {
      const raw =
        'error: HTTP 401 with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(clean).toContain('Bearer ***');
    });

    it('masks password flags and key-values', () => {
      const raw = 'fatal: authentication failed for password=mySecretPassword123 and user=alice';
      const clean = sanitizeStderr(raw);
      expect(clean).not.toContain('mySecretPassword123');
      expect(clean).toContain('password=***');
    });
  });

  describe('sanitizeGitCommandMetadata', () => {
    it('creates sanitized command representation without secrets', () => {
      const meta = sanitizeGitCommandMetadata(
        'git',
        ['clone', 'https://user:pass1234@github.com/repo.git', '--password=secretVal'],
        150,
      );

      expect(meta.command).not.toContain('pass1234');
      expect(meta.command).not.toContain('secretVal');
      expect(meta.command).toContain('https://user:***@github.com/repo.git');
      expect(meta.command).toContain('--password=***');
      expect(meta.args[1]).toBe('https://user:***@github.com/repo.git');
      expect(meta.args[2]).toBe('--password=***');
      expect(meta.durationMs).toBe(150);
    });
  });

  describe('mapErrorToActionableMessage', () => {
    it('maps dirty working tree overwritten error', () => {
      const raw =
        'error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/index.ts\nPlease commit your changes or stash them before you switch branches.';
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.DIRTY_WORKTREE);
      expect(res.actionableMessage).toContain('uncommitted or conflicting changes');
    });

    it('maps existing branch error', () => {
      const raw = "fatal: A branch named 'feature/login' already exists.";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain("A branch named 'feature/login' already exists");
    });

    it('maps existing tag error', () => {
      const raw = "fatal: tag 'v1.0.0' already exists";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain("A tag named 'v1.0.0' already exists");
    });

    it('maps invalid branch name error', () => {
      const raw = "fatal: 'feature login' is not a valid branch name.";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain('not a valid branch name');
    });

    it('maps index.lock error', () => {
      const raw =
        "fatal: Unable to create '/path/to/.git/index.lock': File exists.\nAnother git process seems to be running in this repository";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain('index.lock file exists');
    });

    it('maps not a git repository error', () => {
      const raw = 'fatal: not a git repository (or any of the parent directories): .git';
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.NOT_A_REPOSITORY);
      expect(res.actionableMessage).toContain('not a valid Git repository');
    });

    it('maps cannot delete/force update current branch', () => {
      const raw = "fatal: Cannot delete the current branch 'main'";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain('currently checked-out branch');
    });

    it('maps already checked out in another worktree', () => {
      const raw = "fatal: 'main' is already checked out at '/Users/dev/worktree-2'";
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toContain(
        "Branch 'main' is already checked out in another worktree at '/Users/dev/worktree-2'",
      );
    });

    it('maps cancellation or AbortError', () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      const res = mapErrorToActionableMessage(abortErr);
      expect(res.code).toBe(AppErrorCode.OPERATION_CANCELLED);
      expect(res.actionableMessage).toContain('operation was cancelled');
    });

    it('falls back to sanitized message for unknown errors', () => {
      const raw = 'error: unexpected network timeout occurred';
      const res = mapErrorToActionableMessage(raw);

      expect(res.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      expect(res.actionableMessage).toBe('error: unexpected network timeout occurred');
    });
  });

  describe('createOperationSuccessResult', () => {
    it('constructs complete success result object', () => {
      const meta = { command: 'git checkout main', args: ['checkout', 'main'] };
      const res = createOperationSuccessResult('op-1', 'repo-1', { ref: 'main' }, meta, 85);

      expect(res.operationId).toBe('op-1');
      expect(res.repositoryId).toBe('repo-1');
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ ref: 'main' });
      expect(res.commandMetadata).toBe(meta);
      expect(res.durationMs).toBe(85);
      expect(res.error).toBeUndefined();
    });
  });

  describe('createOperationFailureResult', () => {
    it('constructs failure result with sanitized error details and actionable message', () => {
      const rawError =
        "fatal: A branch named 'feat-1' already exists.\nremote: token ghp_123456789012345678901234567890123456";
      const res = createOperationFailureResult('op-2', 'repo-1', rawError);

      expect(res.operationId).toBe('op-2');
      expect(res.repositoryId).toBe('repo-1');
      expect(res.success).toBe(false);
      expect(res.actionableMessage).toContain("A branch named 'feat-1' already exists");
      expect(res.sanitizedStderr).not.toContain('ghp_123456789012345678901234567890123456');
      expect(res.sanitizedStderr).toContain('ghp_***');
      expect(res.error?.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
    });
  });
});
