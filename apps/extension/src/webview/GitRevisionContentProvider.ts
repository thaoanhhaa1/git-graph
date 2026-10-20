import * as vscode from 'vscode';
import * as path from 'path';
import type { RepositoryManager } from '../repositories/RepositoryManager';

/**
 * URI scheme used to access historical file content from Git revisions.
 */
export const GIT_REVISION_SCHEME = 'git-graph-revision';

/**
 * TextDocumentContentProvider that provides file contents at specific Git commits or revisions.
 * URI format: git-graph-revision:///<filePath>?repoId=<repoId>&sha=<sha>
 */
export class GitRevisionContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly SCHEME = GIT_REVISION_SCHEME;
  /** Pseudo-SHA resolving to the staged content in the Git index. */
  public static readonly INDEX_SHA = 'INDEX';

  private readonly _repositoryManager: RepositoryManager;
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  public constructor(repositoryManager: RepositoryManager) {
    this._repositoryManager = repositoryManager;
  }

  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  /**
   * Helper to build a Uri for a specific file revision.
   */
  public static buildUri(
    repositoryId: string,
    sha: string | undefined,
    filePath: string,
  ): vscode.Uri {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const query = `repoId=${encodeURIComponent(repositoryId)}&sha=${encodeURIComponent(sha ?? '')}`;
    return vscode.Uri.parse(`${GIT_REVISION_SCHEME}:${cleanPath}?${query}`);
  }

  /**
   * Resolves content of the text document for the given git-graph-revision URI.
   */
  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const repoId = params.get('repoId');
    const sha = params.get('sha');
    const filePath = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;

    if (!repoId || !sha || !filePath || sha === 'empty' || sha === 'null') {
      return '';
    }

    const repo = this._repositoryManager.getRepository(repoId);
    if (!repo) {
      return '';
    }

    if (sha === 'UNCOMMITTED' || sha === '0000000000000000000000000000000000000000') {
      try {
        const fullPath = repo.rootPath ? path.join(repo.rootPath, filePath) : filePath;
        const uriFile = vscode.Uri.file(fullPath);
        const data = await vscode.workspace.fs.readFile(uriFile);
        return new TextDecoder().decode(data);
      } catch {
        return '';
      }
    }

    if (sha === GitRevisionContentProvider.INDEX_SHA) {
      try {
        return await repo.getIndexFileContent(filePath);
      } catch {
        return '';
      }
    }

    try {
      return await repo.getFileContent(sha, filePath);
    } catch {
      return '';
    }
  }

  public dispose(): void {
    this._onDidChange.dispose();
  }
}
