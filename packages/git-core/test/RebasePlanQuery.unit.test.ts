import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { RebasePlanQuery } from '../src/queries/RebasePlanQuery';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const createResult = (overrides: Partial<GitResult> = {}): GitResult => ({
  stdout: '',
  stderr: '',
  exitCode: 0,
  signal: null,
  stdoutBuffer: Buffer.from(overrides.stdout ?? ''),
  stderrBuffer: Buffer.from(overrides.stderr ?? ''),
  durationMs: 1,
  command: 'git',
  args: [],
  ...overrides,
});

const createMockClient = (execFn: GitClient['exec']): GitClient => ({
  gitPath: 'git',
  getVersion: vi.fn().mockResolvedValue({
    raw: 'git version 2.40.0',
    major: 2,
    minor: 40,
    patch: 0,
  }),
  exec: execFn,
});

describe('RebasePlanQuery (unit)', () => {
  it('parses log output into oldest-first plan entries', () => {
    const stdout = [
      `${SHA_A}\u0000aaaaaaa\u0000Alice\u00001710000000\u0000First commit`,
      `${SHA_B}\u0000bbbbbbb\u0000Bob\u00001720000000\u0000Second commit`,
    ].join('\n');

    expect(RebasePlanQuery.parse(stdout)).toEqual([
      {
        action: 'pick',
        sha: SHA_A,
        shortSha: 'aaaaaaa',
        subject: 'First commit',
        author: 'Alice',
        date: 1710000000,
      },
      {
        action: 'pick',
        sha: SHA_B,
        shortSha: 'bbbbbbb',
        subject: 'Second commit',
        author: 'Bob',
        date: 1720000000,
      },
    ]);
  });

  it('parses todo commands and aliases while ignoring comments and unsupported commands', () => {
    const todo = [
      '# Rebase todo',
      'pick aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa First commit',
      'r bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Second commit',
      's cccccccccccccccccccccccccccccccccccccccc Third commit',
      'f dddddddddddddddddddddddddddddddddddddddd Fourth commit',
      'd eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee Fifth commit',
      'exec echo hello',
      'label base',
    ].join('\n');

    expect(RebasePlanQuery.parseTodo(todo)).toEqual([
      {
        action: 'pick',
        sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        shortSha: 'aaaaaaa',
        subject: 'First commit',
        author: '',
        date: 0,
      },
      {
        action: 'reword',
        sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        shortSha: 'bbbbbbb',
        subject: 'Second commit',
        author: '',
        date: 0,
      },
      {
        action: 'squash',
        sha: 'cccccccccccccccccccccccccccccccccccccccc',
        shortSha: 'ccccccc',
        subject: 'Third commit',
        author: '',
        date: 0,
      },
      {
        action: 'fixup',
        sha: 'dddddddddddddddddddddddddddddddddddddddd',
        shortSha: 'ddddddd',
        subject: 'Fourth commit',
        author: '',
        date: 0,
      },
      {
        action: 'drop',
        sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        shortSha: 'eeeeeee',
        subject: 'Fifth commit',
        author: '',
        date: 0,
      },
    ]);
  });

  it('formats todo entries and strips line breaks from subjects', () => {
    const todo = RebasePlanQuery.formatTodo([
      {
        action: 'pick',
        sha: SHA_A,
        shortSha: 'aaaaaaa',
        subject: 'First\ncommit\r\nsubject',
        author: 'Alice',
        date: 1710000000,
      },
      {
        action: 'fixup',
        sha: SHA_B,
        shortSha: 'bbbbbbb',
        subject: ' ',
        author: 'Bob',
        date: 1720000000,
      },
    ]);

    expect(todo).toBe(`pick ${SHA_A} First commit subject\nfixup ${SHA_B}\n`);
  });

  it('resolves the target and lists commits after it', async () => {
    const exec = vi
      .fn<GitClient['exec']>()
      .mockResolvedValueOnce(createResult({ stdout: `${SHA_A}\n` }))
      .mockResolvedValueOnce(
        createResult({
          stdout: `${SHA_B}\u0000bbbbbbb\u0000Bob\u00001720000000\u0000Second commit\n`,
        }),
      );
    const query = new RebasePlanQuery({ client: createMockClient(exec) });

    const entries = await query.list('/repo', 'main~1');

    expect(entries).toHaveLength(1);
    expect(entries[0]!.sha).toBe(SHA_B);
    expect(exec).toHaveBeenNthCalledWith(
      1,
      ['rev-parse', '--verify', '--quiet', 'main~1^{commit}'],
      expect.objectContaining({ cwd: '/repo' }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(['log', '--no-merges', '--reverse', '--topo-order']),
      expect.objectContaining({ cwd: '/repo' }),
    );
    expect(exec.mock.calls[1]![0]).toContain(`${SHA_A}..HEAD`);
  });

  it('rejects unsafe or unresolvable targets', async () => {
    const exec = vi.fn<GitClient['exec']>();
    const query = new RebasePlanQuery({ client: createMockClient(exec) });

    await expect(query.list('/repo', '--output=/tmp/x')).rejects.toThrow(
      'is not a valid rebase target',
    );
    expect(exec).not.toHaveBeenCalled();

    exec.mockResolvedValueOnce(createResult({ stderr: 'fatal: bad revision', exitCode: 128 }));
    await expect(query.list('/repo', 'missing')).rejects.toThrow('does not resolve to a commit');
  });
});
