import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import { ReflogQuery } from '../src/queries/ReflogQuery';

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

describe('ReflogQuery (unit)', () => {
  it('parses reflog entries with indexes and subjects', () => {
    const stdout = [
      'aaa111\0aaa1111\0HEAD@{0}\0commit: merge feature',
      'bbb222\0bbb2222\0HEAD@{1}\0reset: moving to HEAD~1',
      'ccc333\0ccc3333\0HEAD@{2}\0checkout: moving from main to feature',
    ].join('\n');

    expect(ReflogQuery.parse(stdout)).toEqual([
      {
        sha: 'aaa111',
        shortSha: 'aaa1111',
        index: 0,
        selector: 'HEAD@{0}',
        subject: 'commit: merge feature',
      },
      {
        sha: 'bbb222',
        shortSha: 'bbb2222',
        index: 1,
        selector: 'HEAD@{1}',
        subject: 'reset: moving to HEAD~1',
      },
      {
        sha: 'ccc333',
        shortSha: 'ccc3333',
        index: 2,
        selector: 'HEAD@{2}',
        subject: 'checkout: moving from main to feature',
      },
    ]);
  });

  it('skips malformed selectors and blank lines', () => {
    expect(ReflogQuery.parse('\ninvalid\nsha\0short\0HEAD\0subject\n')).toEqual([]);
  });

  it('clamps the requested limit and queries HEAD', async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'aaa111\0aaa1111\0HEAD@{0}\0initial',
      stderr: '',
    });
    const query = new ReflogQuery({ client: createMockClient(exec) });

    await query.list('/repo', 500);

    expect(exec).toHaveBeenCalledWith(
      ['reflog', 'show', '--format=%H%x00%h%x00%gd%x00%gs', '-n', '100', 'HEAD'],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });

  it('returns an empty list when git fails or throws', async () => {
    const failing = new ReflogQuery({
      client: createMockClient(
        vi.fn().mockResolvedValue({ exitCode: 128, stdout: '', stderr: 'fatal' }),
      ),
    });
    const throwing = new ReflogQuery({
      client: createMockClient(vi.fn().mockRejectedValue(new Error('spawn failed'))),
    });

    await expect(failing.list('/repo')).resolves.toEqual([]);
    await expect(throwing.list('/repo')).resolves.toEqual([]);
  });
});
