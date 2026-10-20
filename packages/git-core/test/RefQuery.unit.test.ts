import { describe, expect, it, vi } from 'vitest';
import type { GitClient } from '../src/client/GitClient';
import { REF_FIELD_SEPARATOR, REF_RECORD_SEPARATOR } from '../src/parsers/RefParser';
import { RefQuery } from '../src/queries/RefQuery';

describe('RefQuery (unit)', () => {
  const makeRecord = (
    fullName: string,
    objectname: string,
    objecttype: string,
    peeledTarget = '',
    upstream = '',
    headMarker = '',
    symref = '',
  ) => {
    return [fullName, objectname, objecttype, peeledTarget, upstream, headMarker, symref].join(
      REF_FIELD_SEPARATOR,
    );
  };

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

  it('queries refs for repository with attached HEAD', async () => {
    const mockOutput = [
      makeRecord(
        'refs/heads/main',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        'origin/main',
        '*',
      ),
      makeRecord('refs/remotes/origin/main', '1111111111111111111111111111111111111111', 'commit'),
      makeRecord(
        'refs/remotes/origin/HEAD',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        '',
        '',
        'refs/remotes/origin/main',
      ),
      makeRecord('refs/tags/v1.0.0', '2222222222222222222222222222222222222222', 'commit'),
    ].join(REF_RECORD_SEPARATOR);

    const mockClient = createMockClient(
      vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: mockOutput,
        stderr: '',
      }),
    );

    const query = new RefQuery({ client: mockClient });
    const result = await query.queryRefs('/fake/repo');

    expect(result.isDetachedHead).toBe(false);
    expect(result.currentBranch).toBe('main');
    expect(result.head).toEqual({
      name: 'HEAD',
      fullName: 'HEAD',
      target: '1111111111111111111111111111111111111111',
      kind: 'head',
      isCurrent: true,
    });
    expect(result.localBranches).toHaveLength(1);
    expect(result.localBranches[0]?.name).toBe('main');
    // Symbolic remote HEAD should be excluded by default
    expect(result.remoteBranches).toHaveLength(1);
    expect(result.remoteBranches[0]?.name).toBe('origin/main');
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.name).toBe('v1.0.0');
    // allRefs includes head, local, remote, tags
    expect(result.allRefs).toHaveLength(4);
  });

  it('includes symbolic refs when includeSymbolic is true', async () => {
    const mockOutput = [
      makeRecord(
        'refs/heads/main',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        '',
        '*',
      ),
      makeRecord('refs/remotes/origin/main', '1111111111111111111111111111111111111111', 'commit'),
      makeRecord(
        'refs/remotes/origin/HEAD',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        '',
        '',
        'refs/remotes/origin/main',
      ),
    ].join(REF_RECORD_SEPARATOR);

    const mockClient = createMockClient(
      vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: mockOutput,
        stderr: '',
      }),
    );

    const query = new RefQuery({ client: mockClient });
    const result = await query.queryRefs('/fake/repo', { includeSymbolic: true });

    expect(result.remoteBranches).toHaveLength(2);
    expect(result.remoteBranches.some((r) => r.name === 'origin/HEAD')).toBe(true);
  });

  it('resolves detached HEAD state properly', async () => {
    // In detached HEAD, no local branch has '*'
    const mockOutput = [
      makeRecord(
        'refs/heads/main',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        '',
        ' ',
      ),
      makeRecord('refs/tags/v1.0.0', '2222222222222222222222222222222222222222', 'commit'),
    ].join(REF_RECORD_SEPARATOR);

    const detachedSha = '3333333333333333333333333333333333333333';

    const mockClient = createMockClient(
      vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === 'for-each-ref') {
          return Promise.resolve({ exitCode: 0, stdout: mockOutput, stderr: '' });
        }
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
          return Promise.resolve({ exitCode: 0, stdout: `${detachedSha}\n`, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'error' });
      }),
    );

    const query = new RefQuery({ client: mockClient });
    const result = await query.queryRefs('/fake/repo');

    expect(result.isDetachedHead).toBe(true);
    expect(result.currentBranch).toBeUndefined();
    expect(result.head).toEqual({
      name: 'HEAD',
      fullName: 'HEAD',
      target: detachedSha,
      kind: 'head',
      isCurrent: true,
    });
    expect(result.localBranches).toHaveLength(1);
    expect(result.tags).toHaveLength(1);
  });

  it('handles empty repository gracefully', async () => {
    const mockClient = createMockClient(
      vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === 'for-each-ref') {
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }
        if (args[0] === 'rev-parse') {
          return Promise.resolve({
            exitCode: 128,
            stdout: '',
            stderr: 'fatal: Needed a single revision',
          });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'error' });
      }),
    );

    const query = new RefQuery({ client: mockClient });
    const result = await query.queryRefs('/fake/repo');

    expect(result.isDetachedHead).toBe(false);
    expect(result.currentBranch).toBeUndefined();
    expect(result.head).toBeUndefined();
    expect(result.localBranches).toEqual([]);
    expect(result.remoteBranches).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.allRefs).toEqual([]);
  });

  it('provides convenient getters (getBranches, getTags, getHead)', async () => {
    const mockOutput = [
      makeRecord(
        'refs/heads/main',
        '1111111111111111111111111111111111111111',
        'commit',
        '',
        '',
        '*',
      ),
      makeRecord('refs/heads/dev', '2222222222222222222222222222222222222222', 'commit'),
      makeRecord('refs/remotes/origin/dev', '2222222222222222222222222222222222222222', 'commit'),
      makeRecord('refs/tags/v1.0.0', '1111111111111111111111111111111111111111', 'commit'),
    ].join(REF_RECORD_SEPARATOR);

    const mockClient = createMockClient(
      vi.fn().mockResolvedValue({ exitCode: 0, stdout: mockOutput, stderr: '' }),
    );

    const query = new RefQuery({ client: mockClient });

    const allBranches = await query.getBranches('/fake/repo');
    expect(allBranches).toHaveLength(3); // 2 local + 1 remote

    const localOnly = await query.getLocalBranches('/fake/repo');
    expect(localOnly).toHaveLength(2);

    const remoteOnly = await query.getRemoteBranches('/fake/repo');
    expect(remoteOnly).toHaveLength(1);

    const tags = await query.getTags('/fake/repo');
    expect(tags).toHaveLength(1);

    const head = await query.getHead('/fake/repo');
    expect(head?.target).toBe('1111111111111111111111111111111111111111');
  });
});
