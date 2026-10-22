import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as vscode from 'vscode';
import type { GitRepository, GitResult } from '@git-graph/git-core';
import { syncAndRefreshGit } from '../src/application/vsCodeGitRefresh';

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
    exec: vi.fn(execMock || (async () => createMockGitResult())),
  } as unknown as GitRepository;
}

describe('vsCodeGitRefresh (syncAndRefreshGit)', () => {
  let executedCommands: Array<{ command: string; args: unknown[] }>;

  beforeEach(() => {
    executedCommands = [];
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command, ...args) => {
      executedCommands.push({ command, args });
      return undefined;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs update-index -q --refresh on non-bare repository and executes git.refresh', async () => {
    const execCalls: string[][] = [];
    const mockRepo = createMockRepo('repo-1', async (args) => {
      execCalls.push([...args]);
      return createMockGitResult();
    });

    await syncAndRefreshGit(mockRepo, { delayMs: 0 });

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]).toEqual(['update-index', '-q', '--refresh']);
    expect(executedCommands.some((c) => c.command === 'git.refresh')).toBe(true);
    const gitRefreshCall = executedCommands.find((c) => c.command === 'git.refresh');
    expect(gitRefreshCall?.args[0]).toEqual(vscode.Uri.file('/fake/repo-1'));
  });

  it('skips update-index on bare repository but still triggers git.refresh', async () => {
    const execCalls: string[][] = [];
    const mockRepo = createMockRepo(
      'bare-repo',
      async (args) => {
        execCalls.push([...args]);
        return createMockGitResult();
      },
      true, // isBare
    );

    await syncAndRefreshGit(mockRepo, { delayMs: 0 });

    expect(execCalls).toHaveLength(0);
    expect(executedCommands.some((c) => c.command === 'git.refresh')).toBe(true);
  });

  it('swallows errors if update-index fails and still triggers git.refresh', async () => {
    const mockRepo = createMockRepo('repo-conflict', async () => {
      throw new Error('update-index error');
    });

    await expect(syncAndRefreshGit(mockRepo, { delayMs: 0 })).resolves.toBeUndefined();
    expect(executedCommands.some((c) => c.command === 'git.refresh')).toBe(true);
  });

  it('swallows errors if executeCommand throws or rejects', async () => {
    vi.spyOn(vscode.commands, 'executeCommand').mockRejectedValue(
      new Error('Command git.refresh not found'),
    );
    const mockRepo = createMockRepo('repo-1');

    await expect(syncAndRefreshGit(mockRepo, { delayMs: 0 })).resolves.toBeUndefined();
  });

  it('triggers git.refresh globally when called without repository', async () => {
    await syncAndRefreshGit(undefined, { delayMs: 0 });

    expect(executedCommands).toHaveLength(1);
    expect(executedCommands[0].command).toBe('git.refresh');
    expect(executedCommands[0].args).toHaveLength(0);
  });

  it('schedules delayed second refresh when delayMs > 0', async () => {
    vi.useFakeTimers();
    try {
      const mockRepo = createMockRepo('repo-1');
      await syncAndRefreshGit(mockRepo, { delayMs: 150 });

      // Immediate refresh happened
      expect(executedCommands).toHaveLength(1);

      // Fast-forward timers
      vi.advanceTimersByTime(150);

      // Second refresh happened
      expect(executedCommands).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
