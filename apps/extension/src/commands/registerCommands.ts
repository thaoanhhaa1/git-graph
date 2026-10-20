import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Registers all extension commands.
 *
 * @param context The extension context.
 * @returns Array of disposables registered for commands.
 */
export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  const openGraphDisposable = vscode.commands.registerCommand('gitGraph.openGraph', async () => {
    const { GitGraphPanel } = await import('../webview/GitGraphPanel');
    GitGraphPanel.createOrShow(context.extensionUri);
  });

  const viewFileHistoryDisposable = vscode.commands.registerCommand(
    'gitGraph.viewFileHistory',
    async (fileUri?: vscode.Uri) => {
      const uri = fileUri ?? vscode.window.activeTextEditor?.document?.uri;
      const { GitGraphPanel } = await import('../webview/GitGraphPanel');
      const panel = GitGraphPanel.createOrShow(context.extensionUri);

      if (uri && uri.scheme === 'file') {
        const repoManager = panel.repositoryManager;
        let targetRepo = repoManager.getActiveRepository();
        if (!targetRepo?.path || !uri.fsPath.startsWith(targetRepo.path)) {
          const repos = repoManager.getRepositories();
          targetRepo = repos.find((r) => r.path && uri.fsPath.startsWith(r.path));
        }

        const repoPath = targetRepo?.path ?? vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
        if (repoPath) {
          const relativePath = path.relative(repoPath, uri.fsPath).replace(/\\/g, '/');
          panel.setPathFilter(relativePath, targetRepo?.id);
        }
      }
    },
  );

  const openFileAtRevisionDisposable = vscode.commands.registerCommand(
    'gitGraph.openFileAtRevision',
    async (args?: { repositoryId?: string; sha?: string; filePath: string } | vscode.Uri) => {
      if (!args) {
        return;
      }
      if (args instanceof vscode.Uri) {
        await vscode.window.showTextDocument(args);
        return;
      }
      const { repositoryId, sha, filePath } = args;
      if (!filePath) {
        return;
      }

      const isUncommitted =
        !sha ||
        sha === 'UNCOMMITTED' ||
        sha === '*' ||
        sha === '0000000000000000000000000000000000000000';

      if (isUncommitted) {
        const { GitGraphPanel } = await import('../webview/GitGraphPanel');
        const repoManager = GitGraphPanel.currentPanel?.repositoryManager;
        const repo =
          repositoryId && repoManager
            ? repoManager.getRepository(repositoryId)
            : repoManager?.getActiveRepository();
        const fullPath = repo?.rootPath ? path.join(repo.rootPath, filePath) : filePath;
        await vscode.window.showTextDocument(vscode.Uri.file(fullPath));
      } else {
        const { GitRevisionContentProvider } =
          await import('../webview/GitRevisionContentProvider');
        const uri = GitRevisionContentProvider.buildUri(repositoryId ?? '', sha, filePath);
        await vscode.window.showTextDocument(uri);
      }
    },
  );

  disposables.push(openGraphDisposable, viewFileHistoryDisposable, openFileAtRevisionDisposable);
  context.subscriptions.push(
    openGraphDisposable,
    viewFileHistoryDisposable,
    openFileAtRevisionDisposable,
  );

  return disposables;
}
