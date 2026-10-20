import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitRepository } from '@git-graph/git-core';
import { GitRevisionContentProvider } from '../src/webview/GitRevisionContentProvider';
import type { RepositoryManager } from '../src/repositories/RepositoryManager';

describe('GitRevisionContentProvider', () => {
  let repositoryManager: RepositoryManager;

  beforeEach(() => {
    repositoryManager = {
      getRepository: vi.fn(),
    } as unknown as RepositoryManager;
  });

  function contentFor(repoId: string, sha: string, filePath: string): Promise<string> {
    const provider = new GitRevisionContentProvider(repositoryManager);
    return provider.provideTextDocumentContent(
      GitRevisionContentProvider.buildUri(repoId, sha, filePath).with({
        path: `/${filePath}`,
        query: `repoId=${encodeURIComponent(repoId)}&sha=${encodeURIComponent(sha)}`,
      }),
    );
  }

  it('returns empty content for missing or sentinel revisions', async () => {
    expect(await contentFor('repo-1', '', 'a.ts')).toBe('');
    expect(await contentFor('repo-1', 'empty', 'a.ts')).toBe('');
    expect(await contentFor('repo-1', 'null', 'a.ts')).toBe('');
  });

  it('returns empty content when the repository is not found', async () => {
    vi.mocked(repositoryManager.getRepository).mockReturnValue(undefined);
    expect(await contentFor('repo-missing', 'abc', 'a.ts')).toBe('');
  });

  it('reads index content for the INDEX sentinel', async () => {
    const getIndexFileContent = vi.fn().mockResolvedValue('index content');
    vi.mocked(repositoryManager.getRepository).mockReturnValue({
      getIndexFileContent,
      getFileContent: vi.fn(),
    } as unknown as GitRepository);

    expect(await contentFor('repo-1', GitRevisionContentProvider.INDEX_SHA, 'src/a.ts')).toBe(
      'index content',
    );
    expect(getIndexFileContent).toHaveBeenCalledWith('src/a.ts');
  });

  it('reads committed content for a normal sha', async () => {
    const getFileContent = vi.fn().mockResolvedValue('committed content');
    vi.mocked(repositoryManager.getRepository).mockReturnValue({
      getFileContent,
      getIndexFileContent: vi.fn(),
    } as unknown as GitRepository);

    expect(await contentFor('repo-1', 'abc123', 'src/a.ts')).toBe('committed content');
    expect(getFileContent).toHaveBeenCalledWith('abc123', 'src/a.ts');
  });

  it('reads working tree content for the UNCOMMITTED sentinel', async () => {
    vi.mocked(repositoryManager.getRepository).mockReturnValue({
      rootPath: '/repo',
      getFileContent: vi.fn(),
      getIndexFileContent: vi.fn(),
    } as unknown as GitRepository);
    const fsMock = vscode.workspace.fs as unknown as {
      readFile: (uri: vscode.Uri) => Promise<Uint8Array>;
    };
    fsMock.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode('working content'));

    expect(await contentFor('repo-1', 'UNCOMMITTED', 'src/a.ts')).toBe('working content');
    expect(fsMock.readFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/repo/src/a.ts' }),
    );
  });
});
