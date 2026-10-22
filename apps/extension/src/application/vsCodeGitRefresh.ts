import * as vscode from 'vscode';
import type { GitRepository } from '@git-graph/git-core';

export interface SyncAndRefreshGitOptions {
  signal?: AbortSignal;
  delayMs?: number;
}

/**
 * Synchronizes the Git index stat cache (`git update-index -q --refresh`)
 * and triggers VS Code's built-in Git extension refresh (`git.refresh`).
 *
 * This prevents ghost/phantom changes (such as newly merged files appearing as
 * untracked 'U' in the VS Code Source Control sidebar) by reconciling Git's
 * cached file timestamps/inodes with the filesystem, followed by alerting
 * VS Code's SCM provider to reload working tree status.
 */
export async function syncAndRefreshGit(
  repository?: GitRepository,
  options?: SyncAndRefreshGitOptions,
): Promise<void> {
  if (repository && !repository.isBare) {
    try {
      await repository.exec(['update-index', '-q', '--refresh'], {
        signal: options?.signal,
      });
    } catch {
      // Ignored: update-index may exit non-zero if there are unresolved merge conflicts
    }
  }

  const uri = repository?.rootPath ? vscode.Uri.file(repository.rootPath) : undefined;
  const executeGitRefresh = () => {
    try {
      if (uri) {
        void vscode.commands.executeCommand('git.refresh', uri).then(undefined, () => {
          void vscode.commands.executeCommand('git.refresh').then(undefined, () => {});
        });
      } else {
        void vscode.commands.executeCommand('git.refresh').then(undefined, () => {});
      }
    } catch {
      // Ignore if command not registered in testing or if git extension is disabled
    }
  };

  // Immediate trigger
  executeGitRefresh();

  // Delayed trigger to catch trailing file watcher events emitted during external git operations
  const delayMs = options?.delayMs ?? 250;
  if (delayMs > 0) {
    const timer = setTimeout(() => {
      executeGitRefresh();
    }, delayMs);
    timer.unref?.();
  }
}
