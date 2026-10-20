import { describe, it, expect } from 'vitest';
import type { GitClient, GitExecOptions, GitVersion } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { WorktreeQuery, StashQuery, parsePorcelainStatus } from '../src/queries/WorktreeQuery';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';
  public executed: { args: string[]; options?: GitExecOptions }[] = [];
  public results = new Map<string, Partial<GitResult>>();
  public defaultResult: Partial<GitResult> = { stdout: '', stderr: '', exitCode: 0 };

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public async exec(args: readonly string[], options?: GitExecOptions): Promise<GitResult> {
    this.executed.push({ args: [...args], options });
    const key = args[0] ?? '';
    const result = { ...this.defaultResult, ...(this.results.get(key) ?? {}) };
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
      stdoutBuffer: Buffer.from(result.stdout ?? ''),
      stderrBuffer: Buffer.from(result.stderr ?? ''),
      durationMs: 1,
      command: 'git',
      args: [...args],
    };
  }
}

describe('parsePorcelainStatus', () => {
  it('parses staged, unstaged, and untracked entries', () => {
    const output = ['M  src/staged.ts', ' M src/unstaged.ts', '?? new-file.ts', 'MM both.ts'].join(
      '\0',
    );
    const files = parsePorcelainStatus(`${output}\0`);

    expect(files).toHaveLength(4);

    const staged = files.find((f) => f.path === 'src/staged.ts');
    expect(staged).toMatchObject({ status: 'modified', staged: true, unstaged: false });

    const unstaged = files.find((f) => f.path === 'src/unstaged.ts');
    expect(unstaged).toMatchObject({ status: 'modified', staged: false, unstaged: true });

    const untracked = files.find((f) => f.path === 'new-file.ts');
    expect(untracked).toMatchObject({ status: 'untracked', staged: false, unstaged: true });

    const both = files.find((f) => f.path === 'both.ts');
    expect(both).toMatchObject({ status: 'modified', staged: true, unstaged: true });
  });

  it('parses rename entries with destination and source paths', () => {
    const output = 'R  new-name.ts\0old-name.ts\0';
    const files = parsePorcelainStatus(output);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: 'new-name.ts',
      oldPath: 'old-name.ts',
      status: 'renamed',
      staged: true,
    });
  });

  it('parses deleted, added, copied, type changed, and unmerged entries', () => {
    const output = [
      'D  deleted.ts',
      'A  added.ts',
      'C  copy.ts\0source.ts',
      'T  type.ts',
      'UU conflict.ts',
    ].join('\0');
    const files = parsePorcelainStatus(`${output}\0`);

    expect(files.map((f) => f.status)).toEqual([
      'deleted',
      'added',
      'copied',
      'typeChanged',
      'unmerged',
    ]);
    expect(files.find((f) => f.status === 'copied')?.oldPath).toBe('source.ts');
  });

  it('ignores empty output and trailing NUL tokens', () => {
    expect(parsePorcelainStatus('')).toEqual([]);
    expect(parsePorcelainStatus('\0\0')).toEqual([]);
  });
});

describe('WorktreeQuery', () => {
  it('builds status with head commit, branch, and conflicts', async () => {
    const client = new MockGitClient();
    client.results.set('status', {
      stdout: 'UU conflict.ts\0 M edited.ts\0?? untracked.ts\0',
    });
    client.results.set('log', { stdout: `${'a'.repeat(40)}\0feat: prev\0body line` });
    client.results.set('symbolic-ref', { stdout: 'main\n' });

    const query = new WorktreeQuery({ client });
    const status = await query.getStatus('/repo');

    expect(status.isClean).toBe(false);
    expect(status.hasConflicts).toBe(true);
    expect(status.currentBranch).toBe('main');
    expect(status.head).toEqual({
      sha: 'a'.repeat(40),
      subject: 'feat: prev',
      body: 'body line',
    });
    expect(status.unstaged.map((f) => f.path)).toEqual([
      'conflict.ts',
      'edited.ts',
      'untracked.ts',
    ]);
  });

  it('stages all changes with git add -A', async () => {
    const client = new MockGitClient();
    const query = new WorktreeQuery({ client });

    await query.stage('/repo', [], true);

    expect(client.executed.at(-1)?.args).toEqual(['add', '-A', '--', '.']);
  });

  it('stages specific paths and rejects traversal outside the repository', async () => {
    const client = new MockGitClient();
    const query = new WorktreeQuery({ client });

    await query.stage('/repo', ['src/a.ts', './src/b.ts']);
    expect(client.executed.at(-1)?.args).toEqual(['add', '-A', '--', 'src/a.ts', 'src/b.ts']);

    await expect(query.stage('/repo', ['../outside.ts'])).rejects.toThrow('outside the repository');
  });

  it('unstages paths via reset HEAD', async () => {
    const client = new MockGitClient();
    client.results.set('log', { stdout: `${'a'.repeat(40)}\0subject\0` });
    const query = new WorktreeQuery({ client });

    await query.unstage('/repo', ['src/a.ts']);
    expect(client.executed.at(-1)?.args).toEqual(['reset', '-q', 'HEAD', '--', 'src/a.ts']);
  });

  it('commits with message, description, and amend flag', async () => {
    const client = new MockGitClient();
    client.results.set('rev-parse', { stdout: 'b'.repeat(40) });
    client.results.set('log', { stdout: 'feat: new commit' });
    const query = new WorktreeQuery({ client });

    const result = await query.commit('/repo', {
      message: 'feat: new commit',
      description: 'Details',
      amend: true,
    });

    const commitCall = client.executed.find((e) => e.args[0] === 'commit');
    expect(commitCall?.args).toEqual([
      'commit',
      '-m',
      'feat: new commit',
      '-m',
      'Details',
      '--amend',
    ]);
    expect(result).toEqual({ sha: 'b'.repeat(40), subject: 'feat: new commit', amended: true });
  });
});

describe('StashQuery', () => {
  it('parses stash list output including branch and timestamp', async () => {
    const client = new MockGitClient();
    client.results.set('stash', {
      stdout: [
        ['stash@{0}', 'a'.repeat(40), 'WIP on main: 1234567 feat', 'Ada', '1700000000'].join(
          '\u0000',
        ),
        ['stash@{1}', 'b'.repeat(40), 'On feature: custom message', 'Bob', '1700000100'].join(
          '\u0000',
        ),
      ].join('\n'),
    });
    const query = new StashQuery({ client });

    const stashes = await query.list('/repo');

    expect(stashes).toHaveLength(2);
    expect(stashes[0]).toMatchObject({
      index: 0,
      ref: 'stash@{0}',
      sha: 'a'.repeat(40),
      branch: 'main',
      author: 'Ada',
      timestamp: 1700000000000,
    });
    expect(stashes[1]).toMatchObject({
      index: 1,
      branch: 'feature',
      message: 'On feature: custom message',
    });
  });

  it('saves stash with options in a stable argument order', async () => {
    const client = new MockGitClient();
    const query = new StashQuery({ client });

    await query.save('/repo', {
      message: 'wip',
      includeUntracked: true,
      keepIndex: true,
    });

    expect(client.executed.at(-1)?.args).toEqual([
      'stash',
      'push',
      '--include-untracked',
      '--keep-index',
      '-m',
      'wip',
    ]);
  });

  it('uses stash@{n} for pop/apply/drop and validates the index', async () => {
    const client = new MockGitClient();
    const query = new StashQuery({ client });

    await query.pop('/repo', 2);
    expect(client.executed.at(-1)?.args).toEqual(['stash', 'pop', 'stash@{2}']);

    await query.apply('/repo', 1);
    expect(client.executed.at(-1)?.args).toEqual(['stash', 'apply', 'stash@{1}']);

    await query.drop('/repo', 0);
    expect(client.executed.at(-1)?.args).toEqual(['stash', 'drop', 'stash@{0}']);

    await expect(query.drop('/repo', -1)).rejects.toThrow('Invalid stash index');
  });
});
