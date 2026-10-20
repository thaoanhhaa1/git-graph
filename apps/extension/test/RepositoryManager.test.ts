import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import type { RepositoryDescriptor } from '@git-graph/shared';
import { RepositoryLocator } from '@git-graph/git-core';
import { RepositoryManager } from '../src/repositories/RepositoryManager';

describe('RepositoryManager', () => {
  let mockLocator: RepositoryLocator;

  beforeEach(() => {
    mockLocator = new RepositoryLocator();
  });

  it('discovers single repository from workspace folders', async () => {
    (
      vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = [
      {
        uri: vscode.Uri.file('/projects/repo-1'),
        name: 'repo-1',
        index: 0,
      },
    ];

    const descriptor: RepositoryDescriptor = {
      id: 'repo-1-hash',
      name: 'repo-1',
      rootPath: '/projects/repo-1',
      gitDir: '/projects/repo-1/.git',
      isBare: false,
      currentBranch: 'main',
      isDetachedHead: false,
      path: '/projects/repo-1',
    };

    vi.spyOn(mockLocator, 'locateAll').mockResolvedValue([descriptor]);

    const manager = new RepositoryManager({ locator: mockLocator });
    const repos = await manager.discoverRepositories();

    expect(repos).toHaveLength(1);
    expect(repos[0]?.id).toBe('repo-1-hash');
    expect(manager.getActiveRepository()?.id).toBe('repo-1-hash');
    expect(manager.isDiscovered).toBe(true);
  });

  it('handles empty workspace folders gracefully and returns empty list', async () => {
    (
      vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = undefined;

    vi.spyOn(mockLocator, 'locateAll').mockResolvedValue([]);

    const manager = new RepositoryManager({ locator: mockLocator });
    const repos = await manager.discoverRepositories();

    expect(repos).toHaveLength(0);
    expect(manager.getActiveRepository()).toBeUndefined();
  });

  it('deduplicates multi-root folders when locator returns deduplicated list', async () => {
    (
      vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = [
      { uri: vscode.Uri.file('/projects/monorepo'), name: 'monorepo', index: 0 },
      { uri: vscode.Uri.file('/projects/monorepo/packages/a'), name: 'pkg-a', index: 1 },
      { uri: vscode.Uri.file('/projects/other-repo'), name: 'other', index: 2 },
    ];

    const repo1: RepositoryDescriptor = {
      id: 'monorepo-id',
      name: 'monorepo',
      rootPath: '/projects/monorepo',
      gitDir: '/projects/monorepo/.git',
      isBare: false,
      currentBranch: 'main',
      path: '/projects/monorepo',
    };

    const repo2: RepositoryDescriptor = {
      id: 'other-id',
      name: 'other-repo',
      rootPath: '/projects/other-repo',
      gitDir: '/projects/other-repo/.git',
      isBare: false,
      currentBranch: 'develop',
      path: '/projects/other-repo',
    };

    const locateAllSpy = vi.spyOn(mockLocator, 'locateAll').mockResolvedValue([repo1, repo2]);

    const manager = new RepositoryManager({ locator: mockLocator });
    const repos = await manager.discoverRepositories();

    expect(locateAllSpy).toHaveBeenCalledWith([
      '/projects/monorepo',
      '/projects/monorepo/packages/a',
      '/projects/other-repo',
    ]);
    expect(repos).toHaveLength(2);
    expect(repos.map((r) => r.id)).toEqual(['monorepo-id', 'other-id']);
  });

  it('allows setting active repository and fires event', async () => {
    (
      vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = [
      { uri: vscode.Uri.file('/projects/repo-a'), name: 'repo-a', index: 0 },
      { uri: vscode.Uri.file('/projects/repo-b'), name: 'repo-b', index: 1 },
    ];

    const repoA: RepositoryDescriptor = {
      id: 'repo-a',
      name: 'repo-a',
      rootPath: '/projects/repo-a',
      gitDir: '/projects/repo-a/.git',
      isBare: false,
      path: '/projects/repo-a',
    };
    const repoB: RepositoryDescriptor = {
      id: 'repo-b',
      name: 'repo-b',
      rootPath: '/projects/repo-b',
      gitDir: '/projects/repo-b/.git',
      isBare: false,
      path: '/projects/repo-b',
    };

    vi.spyOn(mockLocator, 'locateAll').mockResolvedValue([repoA, repoB]);

    const manager = new RepositoryManager({ locator: mockLocator });
    await manager.discoverRepositories();

    expect(manager.getActiveRepository()?.id).toBe('repo-a');

    let activeChanged: RepositoryDescriptor | undefined;
    manager.onDidChangeActiveRepository((repo) => {
      activeChanged = repo;
    });

    manager.setActiveRepository('repo-b');
    expect(manager.getActiveRepository()?.id).toBe('repo-b');
    expect(activeChanged?.id).toBe('repo-b');
  });

  it('triggers rediscovery when workspace folders change', async () => {
    const manager = new RepositoryManager({ locator: mockLocator });
    const discoverSpy = vi.spyOn(manager, 'discoverRepositories').mockResolvedValue([]);

    const mockWs = vscode.workspace as { _fireDidChangeWorkspaceFolders?: () => void };
    if (mockWs._fireDidChangeWorkspaceFolders) {
      mockWs._fireDidChangeWorkspaceFolders();
    }

    expect(discoverSpy).toHaveBeenCalled();
  });

  it('creates and caches GitRepository instances via getRepository and getActiveGitRepository', async () => {
    const descriptor: RepositoryDescriptor = {
      id: 'repo-cache-test',
      name: 'repo-cache',
      rootPath: '/projects/repo-cache',
      gitDir: '/projects/repo-cache/.git',
      isBare: false,
    };

    vi.spyOn(mockLocator, 'locateAll').mockResolvedValue([descriptor]);

    const manager = new RepositoryManager({ locator: mockLocator });
    await manager.discoverRepositories();

    const gitRepo1 = manager.getRepository('repo-cache-test');
    expect(gitRepo1).toBeDefined();
    expect(gitRepo1?.id).toBe('repo-cache-test');
    expect(gitRepo1?.rootPath).toBe('/projects/repo-cache');

    // Instance should be cached
    const gitRepo2 = manager.getRepository('repo-cache-test');
    expect(gitRepo2).toBe(gitRepo1);

    // Active GitRepository
    const activeGitRepo = manager.getActiveGitRepository();
    expect(activeGitRepo).toBe(gitRepo1);

    // Unknown ID returns undefined
    expect(manager.getRepository('unknown-id')).toBeUndefined();
  });
});
