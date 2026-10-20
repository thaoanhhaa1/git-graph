import { describe, expect, it } from 'vitest';
import type { RepositoryDescriptor } from '@git-graph/shared';
import type { GitClient, GitExecOptions, GitVersion } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { GitRepository } from '../src/repository/GitRepository';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public executed: { args: string[]; options?: GitExecOptions }[] = [];
  public mockResult: GitResult = {
    stdout: '',
    stderr: '',
    stdoutBuffer: Buffer.alloc(0),
    stderrBuffer: Buffer.alloc(0),
    exitCode: 0,
    durationMs: 1,
    command: 'git',
    args: [],
  };

  public async exec(args: readonly string[], options?: GitExecOptions): Promise<GitResult> {
    this.executed.push({ args: [...args], options });
    return { ...this.mockResult, args: [...args] };
  }
}

describe('GitRepository - Unit Tests', () => {
  const descriptor: RepositoryDescriptor = {
    id: 'repo-123',
    name: 'my-project',
    rootPath: '/projects/my-project',
    gitDir: '/projects/my-project/.git',
    isBare: false,
    currentBranch: 'main',
  };

  it('exposes repository metadata properties correctly', () => {
    const client = new MockGitClient();
    const repo = new GitRepository(descriptor, { client });

    expect(repo.id).toBe('repo-123');
    expect(repo.name).toBe('my-project');
    expect(repo.rootPath).toBe('/projects/my-project');
    expect(repo.gitDir).toBe('/projects/my-project/.git');
    expect(repo.isBare).toBe(false);
    expect(repo.descriptor).toEqual(descriptor);
  });

  it('retrieves configured remotes from git remote command and caches result', async () => {
    const client = new MockGitClient();
    client.mockResult = {
      ...client.mockResult,
      stdout: 'origin\nupstream\n',
    };

    const repo = new GitRepository(descriptor, { client });
    const remotes1 = await repo.getRemotes();
    expect(remotes1).toEqual(['origin', 'upstream']);
    expect(client.executed).toHaveLength(1);
    expect(client.executed[0]?.args).toEqual(['remote']);

    // Second call should use cache
    const remotes2 = await repo.getRemotes();
    expect(remotes2).toEqual(['origin', 'upstream']);
    expect(client.executed).toHaveLength(1);
  });

  it('delegates getCommits, getCommitDetails, getCommitBody, and getCommitDiff', async () => {
    const client = new MockGitClient();
    const repo = new GitRepository(descriptor, { client });

    // Mock queryCommits on custom commitQuery
    const page = await repo.getCommits({ limit: 10 });
    expect(page).toHaveProperty('commits');
    expect(page).toHaveProperty('hasMore');

    // getCommitDetails
    const commit = await repo.getCommitDetails('a'.repeat(40));
    expect(commit).toBeNull(); // Empty stdout returns null

    // getCommitBody
    client.mockResult = { ...client.mockResult, stdout: 'Body test' };
    const body = await repo.getCommitBody('b'.repeat(40));
    expect(body).toBe('Body test');

    // getCommitDiff
    client.mockResult = { ...client.mockResult, stdout: 'Diff test' };
    const diff = await repo.getCommitDiff('c'.repeat(40), 'd'.repeat(40));
    expect(diff).toBe('Diff test');
  });

  it('GitRepository.open returns GitRepository instance from descriptor or null for invalid dir', async () => {
    const client = new MockGitClient();
    const instance = await GitRepository.open(descriptor, { client });
    expect(instance).not.toBeNull();
    expect(instance?.id).toBe(descriptor.id);

    const nonExistent = await GitRepository.open('/non/existent/path/99999', { client });
    expect(nonExistent).toBeNull();
  });
});
