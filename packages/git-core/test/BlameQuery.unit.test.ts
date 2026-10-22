import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import { BlameQuery } from '../src/queries/BlameQuery';

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

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('BlameQuery (unit)', () => {
  it('parses porcelain output and reuses metadata for grouped lines', () => {
    const stdout = [
      `^${SHA_A} 1 1 1`,
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1710000000',
      'author-tz +0700',
      'committer Alice',
      'committer-mail <alice@example.com>',
      'committer-time 1710000000',
      'committer-tz +0700',
      'summary Initial commit',
      'filename src/a.ts',
      '\tline one',
      `${SHA_B} 2 2 1`,
      'author Bob',
      'author-mail <bob@example.com>',
      'author-time 1720000000',
      'author-tz +0700',
      'committer Bob',
      'committer-mail <bob@example.com>',
      'committer-time 1720000000',
      'committer-tz +0700',
      'summary Second commit',
      'filename src/a.ts',
      '\tline two',
      `${SHA_B} 3 3`,
      '\tline three',
    ].join('\n');

    expect(BlameQuery.parse(stdout)).toEqual([
      {
        sha: SHA_A,
        shortSha: SHA_A.slice(0, 7),
        author: 'Alice',
        authorEmail: 'alice@example.com',
        timestamp: 1710000000,
        subject: 'Initial commit',
        lineNumber: 1,
        originalLineNumber: 1,
        content: 'line one',
      },
      {
        sha: SHA_B,
        shortSha: SHA_B.slice(0, 7),
        author: 'Bob',
        authorEmail: 'bob@example.com',
        timestamp: 1720000000,
        subject: 'Second commit',
        lineNumber: 2,
        originalLineNumber: 2,
        content: 'line two',
      },
      {
        sha: SHA_B,
        shortSha: SHA_B.slice(0, 7),
        author: 'Bob',
        authorEmail: 'bob@example.com',
        timestamp: 1720000000,
        subject: 'Second commit',
        lineNumber: 3,
        originalLineNumber: 3,
        content: 'line three',
      },
    ]);
  });

  it('preserves empty lines and handles CRLF output', () => {
    const stdout = [
      `${SHA_A} 1 1 1`,
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1710000000',
      'summary First',
      '\t',
      `${SHA_A} 2 2`,
      '\tsecond\r',
    ].join('\r\n');

    const lines = BlameQuery.parse(stdout);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.content).toBe('');
    expect(lines[1]?.content).toBe('second');
  });

  it('returns no lines for binary or failed blame output', () => {
    expect(BlameQuery.parse('')).toEqual([]);
    expect(BlameQuery.parse('fatal: no such path in HEAD')).toEqual([]);
  });

  it('parses 10K lines within the performance budget', () => {
    const output: string[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      if (index % 100 === 0) {
        output.push(
          `${SHA_A} ${index + 1} ${index + 1} 100`,
          'author Alice',
          'author-mail <alice@example.com>',
          'author-time 1710000000',
          'summary Initial commit',
        );
      }
      output.push(`\tline ${index}`);
    }
    const stdout = output.join('\n');

    const start = performance.now();
    const lines = BlameQuery.parse(stdout);
    const duration = performance.now() - start;

    expect(lines).toHaveLength(10_000);
    expect(duration).toBeLessThan(500);
  });

  it('queries the requested revision after a -- separator and caches results', async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: `${SHA_A} 1 1 1\nauthor Alice\nsummary First\n\tline\n`,
      stderr: '',
    });
    const query = new BlameQuery({ client: createMockClient(exec) });

    const first = await query.query('/repo', 'src/a.ts', {
      revision: 'HEAD~2',
      repositoryId: 'repo-1',
    });
    const second = await query.query('/repo', 'src/a.ts', {
      revision: 'HEAD~2',
      repositoryId: 'repo-1',
    });

    expect(first).toBe(second);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(
      ['blame', '--porcelain', 'HEAD~2', '--', 'src/a.ts'],
      expect.objectContaining({ cwd: '/repo', maxBufferBytes: 32 * 1024 * 1024 }),
    );
  });

  it('rejects revisions that could be interpreted as options', async () => {
    const query = new BlameQuery({ client: createMockClient(vi.fn()) });

    await expect(query.query('/repo', 'src/a.ts', { revision: '--help' })).rejects.toThrow(
      /Invalid blame revision/,
    );
  });

  it('evicts the least recently used cache entry', async () => {
    const exec = vi.fn().mockImplementation(async () => ({
      exitCode: 0,
      stdout: `${SHA_A} 1 1 1\nauthor Alice\nsummary First\n\tline\n`,
      stderr: '',
    }));
    const query = new BlameQuery({ client: createMockClient(exec) });

    for (let index = 0; index < 51; index += 1) {
      await query.query('/repo', `file-${index}.ts`, {
        revision: 'HEAD',
        repositoryId: `repo-${index}`,
      });
    }
    await query.query('/repo', 'file-0.ts', { revision: 'HEAD', repositoryId: 'repo-0' });

    expect(exec).toHaveBeenCalledTimes(52);
  });
});
