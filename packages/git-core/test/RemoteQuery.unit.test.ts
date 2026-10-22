import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import { RemoteQuery } from '../src/queries/RemoteQuery';

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

describe('RemoteQuery (unit)', () => {
  it('parses distinct remotes and fills missing URLs', () => {
    const stdout = [
      'origin\thttps://example.com/repo.git (fetch)',
      'origin\tgit@example.com:repo.git (push)',
      'upstream\thttps://example.com/upstream.git (fetch)',
      'upstream\thttps://example.com/upstream.git (push)',
      'partial\thttps://example.com/partial.git (fetch)',
    ].join('\n');

    expect(RemoteQuery.parse(stdout)).toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://example.com/repo.git',
        pushUrl: 'git@example.com:repo.git',
      },
      {
        name: 'upstream',
        fetchUrl: 'https://example.com/upstream.git',
        pushUrl: 'https://example.com/upstream.git',
      },
      {
        name: 'partial',
        fetchUrl: 'https://example.com/partial.git',
        pushUrl: 'https://example.com/partial.git',
      },
    ]);
  });

  it('ignores malformed lines and empty input', () => {
    expect(RemoteQuery.parse('')).toEqual([]);
    expect(RemoteQuery.parse('not a remote line\norigin (fetch)')).toEqual([]);
  });

  it('runs git remote -v in the repository directory', async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'origin\thttps://example.com/repo.git (fetch)\n',
      stderr: '',
    });
    const query = new RemoteQuery({ client: createMockClient(exec) });

    await expect(query.list('/repo')).resolves.toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://example.com/repo.git',
        pushUrl: 'https://example.com/repo.git',
      },
    ]);
    expect(exec).toHaveBeenCalledWith(['remote', '-v'], expect.objectContaining({ cwd: '/repo' }));
  });

  it('returns an empty list when git fails', async () => {
    const query = new RemoteQuery({
      client: createMockClient(
        vi.fn().mockResolvedValue({ exitCode: 128, stdout: '', stderr: 'fatal' }),
      ),
    });

    await expect(query.list('/repo')).resolves.toEqual([]);
  });
});
