import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  GitClient,
  GitExecutionOptions,
  GitResult,
  GitVersion,
} from '../src/client/GitClient';
import { GitWorktreeQuery, parseWorktreeList } from '../src/queries/GitWorktreeQuery';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';
  public readonly calls: Array<{ args: string[]; cwd?: string }> = [];

  public constructor(
    private readonly handler: (
      args: string[],
      cwd?: string,
    ) => Partial<GitResult> | undefined = () => undefined,
  ) {}

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public async exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult> {
    const argsArray = [...args];
    this.calls.push({ args: argsArray, cwd: options?.cwd });
    const override = this.handler(argsArray, options?.cwd);
    const stdout = override?.stdout ?? '';
    return {
      stdout,
      stderr: override?.stderr ?? '',
      stdoutBuffer: Buffer.from(stdout),
      stderrBuffer: Buffer.from(override?.stderr ?? ''),
      exitCode: override?.exitCode ?? 0,
      durationMs: 1,
      command: 'git',
      args: argsArray,
    };
  }
}

const WORKTREE_OUTPUT = [
  'worktree /repos/main',
  'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'branch refs/heads/main',
  '',
  'worktree /repos/feature',
  'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'branch refs/heads/feature/login',
  'locked in use',
  '',
].join('\n');

describe('parseWorktreeList', () => {
  it('parses branches, HEAD, lock state, and current worktree', () => {
    const worktrees = parseWorktreeList(WORKTREE_OUTPUT, '/repos/main');

    expect(worktrees).toHaveLength(2);
    expect(worktrees[0]).toMatchObject({
      path: '/repos/main',
      branch: 'main',
      headSha: 'a'.repeat(40),
      isCurrent: true,
    });
    expect(worktrees[1]).toMatchObject({
      path: '/repos/feature',
      branch: 'feature/login',
      isLocked: true,
      lockReason: 'in use',
    });
    expect(worktrees[1]?.isCurrent).toBeUndefined();
  });

  it('parses detached, bare, and prunable entries', () => {
    const output = [
      'worktree /repos/detached',
      'HEAD cccccccccccccccccccccccccccccccccccccccc',
      'detached',
      '',
      'worktree /repos/bare.git',
      'bare',
      '',
      'worktree /repos/stale',
      'HEAD dddddddddddddddddddddddddddddddddddddddd',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n');

    const worktrees = parseWorktreeList(output);

    expect(worktrees[0]).toMatchObject({ isDetached: true });
    expect(worktrees[0]?.branch).toBeUndefined();
    expect(worktrees[1]).toMatchObject({ isBare: true });
    expect(worktrees[2]).toMatchObject({
      isPrunable: true,
      prunableReason: 'gitdir file points to non-existent location',
    });
  });
});

describe('GitWorktreeQuery', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lists worktrees relative to the repository path', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-'));
    const client = new MockGitClient((args) =>
      args[0] === 'worktree' && args[1] === 'list' ? { stdout: WORKTREE_OUTPUT } : undefined,
    );
    const query = new GitWorktreeQuery({ client });

    const worktrees = await query.list(tempDir);

    expect(worktrees).toHaveLength(2);
    expect(client.calls[0]?.args).toEqual(['worktree', 'list', '--porcelain']);
    expect(client.calls[0]?.cwd).toBe(tempDir);
  });

  it('creates a worktree with a new branch and start point', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-'));
    const target = path.join(tempDir, 'linked');
    const client = new MockGitClient((args) => {
      if (args[1] === 'add') {
        return { stdout: '' };
      }
      if (args[1] === 'list') {
        return { stdout: '' };
      }
      return undefined;
    });
    const query = new GitWorktreeQuery({ client });

    await query.add(tempDir, { path: 'linked', branch: 'feature', newBranch: 'feature-2' });

    expect(client.calls[0]?.args).toEqual([
      'worktree',
      'add',
      '-b',
      'feature-2',
      '--',
      target,
      'feature',
    ]);
  });

  it('refuses to remove the current worktree', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-'));
    const client = new MockGitClient((args) =>
      args[1] === 'list' ? { stdout: WORKTREE_OUTPUT } : undefined,
    );
    const query = new GitWorktreeQuery({ client });

    await expect(query.remove('/repos/main', '/repos/main')).rejects.toThrow(
      'Refusing to remove the worktree currently in use.',
    );
  });

  it('refuses to remove an unknown worktree path', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-'));
    const client = new MockGitClient((args) =>
      args[1] === 'list' ? { stdout: WORKTREE_OUTPUT } : undefined,
    );
    const query = new GitWorktreeQuery({ client });

    await expect(query.remove(tempDir, '/repos/unknown')).rejects.toThrow(
      "No linked worktree found at '/repos/unknown'.",
    );
  });

  it('removes a linked worktree with --force when requested', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-'));
    const client = new MockGitClient((args) => {
      if (args[1] === 'list') {
        return { stdout: WORKTREE_OUTPUT };
      }
      if (args[1] === 'remove') {
        return { stdout: '' };
      }
      return undefined;
    });
    const query = new GitWorktreeQuery({ client });

    await query.remove(tempDir, '/repos/feature', true);

    expect(client.calls[1]?.args).toEqual([
      'worktree',
      'remove',
      '--force',
      '--',
      '/repos/feature',
    ]);
  });
});
