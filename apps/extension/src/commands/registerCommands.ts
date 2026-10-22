import * as vscode from 'vscode';
import * as path from 'path';
import type { WebviewDialogKind } from '@git-graph/shared';
import { GitRepository } from '@git-graph/git-core';
import type { BlameDecorationProvider } from '../blame/BlameDecorationProvider';
import { LineHistoryPanel } from '../blame/LineHistoryPanel';

export interface RegisterCommandOptions {
  blameProvider?: BlameDecorationProvider;
}

/**
 * Registers all extension commands.
 *
 * @param context The extension context.
 * @returns Array of disposables registered for commands.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  options: RegisterCommandOptions = {},
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  const openDialog = async (dialog?: WebviewDialogKind) => {
    const { GitGraphPanel } = await import('../webview/GitGraphPanel');
    const panel = GitGraphPanel.createOrShow(context.extensionUri);
    if (dialog) {
      panel.showDialog(dialog);
    }
  };

  const toggleBlameDisposable = vscode.commands.registerCommand(
    'gitGraph.toggleBlame',
    async () => {
      await options.blameProvider?.toggle();
    },
  );

  const revealCommitDisposable = vscode.commands.registerCommand(
    'gitGraph.revealCommit',
    async (args?: { sha?: string; repositoryId?: string } | string) => {
      const sha = typeof args === 'string' ? args : args?.sha;
      if (!sha) {
        return;
      }

      const repositoryId = typeof args === 'object' ? args.repositoryId : undefined;
      const { GitGraphPanel } = await import('../webview/GitGraphPanel');
      const panel = GitGraphPanel.createOrShow(context.extensionUri);
      panel.revealCommit(sha, repositoryId);
    },
  );

  const viewLineHistoryDisposable = vscode.commands.registerCommand(
    'gitGraph.viewLineHistory',
    async (fileUri?: vscode.Uri) => {
      const activeEditor = vscode.window.activeTextEditor;
      const uri = fileUri instanceof vscode.Uri ? fileUri : activeEditor?.document.uri;
      if (!uri || uri.scheme !== 'file') {
        await vscode.window.showWarningMessage(
          'Open a file in a Git repository to view line history.',
        );
        return;
      }

      let document = activeEditor?.document;
      if (!document || document.uri.fsPath !== uri.fsPath) {
        document = await vscode.workspace.openTextDocument(uri);
      }

      let startLine = 1;
      let endLine = 1;
      if (activeEditor && activeEditor.document.uri.fsPath === uri.fsPath) {
        const selection = activeEditor.selection;
        startLine = selection.start.line + 1;
        endLine = selection.isEmpty
          ? startLine
          : selection.end.character > 0
            ? selection.end.line + 1
            : selection.end.line;
        endLine = Math.max(startLine, Math.min(endLine, document.lineCount));
      }

      try {
        const repository = await GitRepository.open(path.dirname(uri.fsPath));
        if (!repository) {
          await vscode.window.showWarningMessage(
            'The selected file is not inside a Git repository.',
          );
          return;
        }

        const relativePath = path.relative(repository.rootPath, uri.fsPath).replace(/\\/g, '/');
        const result = await repository.getLineHistory(relativePath, startLine, endLine);
        if (result.entries.length === 0) {
          await vscode.window.showInformationMessage(
            'No line history found for the selected range.',
          );
          return;
        }

        LineHistoryPanel.show(result, repository.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Failed to load line history: ${message}`);
      }
    },
  );

  const openGraphDisposable = vscode.commands.registerCommand(
    'gitGraph.openGraph',
    async (args?: { dialog?: WebviewDialogKind }) => openDialog(args?.dialog),
  );
  const fetchDisposable = vscode.commands.registerCommand('gitGraph.fetch', async () =>
    openDialog('fetch'),
  );
  const pullDisposable = vscode.commands.registerCommand('gitGraph.pull', async () =>
    openDialog('pull'),
  );
  const pushDisposable = vscode.commands.registerCommand('gitGraph.push', async () =>
    openDialog('push'),
  );
  const manageRemotesDisposable = vscode.commands.registerCommand(
    'gitGraph.manageRemotes',
    async () => openDialog('remotes'),
  );
  const manageWorktreesDisposable = vscode.commands.registerCommand(
    'gitGraph.manageWorktrees',
    async () => openDialog('worktrees'),
  );

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

  disposables.push(
    openGraphDisposable,
    fetchDisposable,
    pullDisposable,
    pushDisposable,
    manageRemotesDisposable,
    manageWorktreesDisposable,
    viewFileHistoryDisposable,
    openFileAtRevisionDisposable,
    toggleBlameDisposable,
    revealCommitDisposable,
    viewLineHistoryDisposable,
  );
  context.subscriptions.push(
    openGraphDisposable,
    fetchDisposable,
    pullDisposable,
    pushDisposable,
    manageRemotesDisposable,
    manageWorktreesDisposable,
    viewFileHistoryDisposable,
    openFileAtRevisionDisposable,
    toggleBlameDisposable,
    revealCommitDisposable,
    viewLineHistoryDisposable,
  );

  return disposables;
}
