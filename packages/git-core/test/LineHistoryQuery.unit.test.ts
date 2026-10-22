import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import { LineHistoryQuery } from '../src/queries/LineHistoryQuery';

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

const SHA_NEW = '2222222222222222222222222222222222222222';
const SHA_OLD = '1111111111111111111111111111111111111111';

const STDOUT = [
  `\x1e${SHA_NEW}\x1f2222222\x1fBob\x1fbob@example.com\x1f1720000000\x1frename file`,
  '',
  'diff --git a/src/old.ts b/src/new.ts',
  'index 1111111..2222222 100644',
  '--- a/src/old.ts',
  '+++ b/src/new.ts',
  '@@ -2,1 +2,1 @@',
  '-old line',
  '+new line',
  '@@ -8,1 +8,1 @@',
  '-old tail',
  '+new tail',
  `\x1e${SHA_OLD}\x1f1111111\x1fAlice\x1falice@example.com\x1f1710000000\x1fcreate file`,
  '',
  'diff --git a/src/old.ts b/src/old.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/old.ts',
  '@@ -0,0 +1,2 @@',
  '+line one',
  '+line two',
].join('\n');

describe('LineHistoryQuery (unit)', () => {
  it('parses entries, follows renames, and keeps multi-hunk diffs', () => {
    const entries = LineHistoryQuery.parse(STDOUT, 'src/new.ts');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sha: SHA_NEW,
      shortSha: '2222222',
      author: 'Bob',
      authorEmail: 'bob@example.com',
      timestamp: 1720000000,
      subject: 'rename file',
      filePath: 'src/new.ts',
    });
    expect(entries[0]?.diff).toContain('@@ -2,1 +2,1 @@');
    expect(entries[0]?.diff).toContain('@@ -8,1 +8,1 @@');
    expect(entries[1]).toMatchObject({
      sha: SHA_OLD,
      filePath: 'src/old.ts',
    });
  });

  it('extracts quoted paths from rename diffs', () => {
    const entries = LineHistoryQuery.parse(
      `\x1e${SHA_NEW}\x1f2222222\x1fBob\x1fbob@example.com\x1f1720000000\x1frename\n\ndiff --git "a/old name.ts" "b/new name.ts"\n--- "a/old name.ts"\n+++ "b/new name.ts"\n@@ -1 +1 @@\n-a\n+b`,
      'fallback.ts',
    );

    expect(entries[0]?.filePath).toBe('new name.ts');
  });

  it('falls back to the requested file path when no diff header is present', () => {
    const entries = LineHistoryQuery.parse(
      `\x1e${SHA_OLD}\x1f1111111\x1fA\x1fa@x\x1f1\x1fsubject`,
      'fallback.ts',
    );

    expect(entries).toEqual([
      {
        sha: SHA_OLD,
        shortSha: '1111111',
        author: 'A',
        authorEmail: 'a@x',
        timestamp: 1,
        subject: 'subject',
        filePath: 'fallback.ts',
        diff: '',
      },
    ]);
  });

  it('queries a normalized line range and includes the format separators', async () => {
    const exec = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const query = new LineHistoryQuery({ client: createMockClient(exec) });

    await query.query('/repo', 'src/a.ts', 0, 2);

    expect(exec).toHaveBeenCalledWith(
      [
        'log',
        '-L1,2:src/a.ts',
        '--no-color',
        '--format=\x1e%H\x1f%h\x1f%an\x1f%ae\x1f%at\x1f%s',
        '--',
      ],
      expect.objectContaining({ cwd: '/repo', timeoutMs: 120_000 }),
    );
  });

  it('propagates git failures', async () => {
    const query = new LineHistoryQuery({
      client: createMockClient(
        vi.fn().mockResolvedValue({ exitCode: 128, stdout: '', stderr: 'fatal' }),
      ),
    });

    await expect(query.query('/repo', 'missing.ts', 1, 1)).rejects.toThrow(/exit code 128/);
  });
});
