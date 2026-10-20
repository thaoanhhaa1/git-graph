import * as vscode from 'vscode';
import type { RepositoryDescriptor } from '@git-graph/shared';

/**
 * Checks whether a given path is a Git state or reference file that should trigger a graph invalidation.
 */
export function isRelevantGitFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  // Direct reference files
  if (normalized.endsWith('/HEAD') || normalized === 'HEAD') {
    return true;
  }
  if (normalized.includes('/refs/') || normalized.startsWith('refs/')) {
    return true;
  }
  if (normalized.endsWith('/packed-refs') || normalized === 'packed-refs') {
    return true;
  }
  if (normalized.endsWith('/logs/HEAD') || normalized === 'logs/HEAD') {
    return true;
  }

  // Active Git operation state files
  if (
    normalized.endsWith('/MERGE_HEAD') ||
    normalized === 'MERGE_HEAD' ||
    normalized.endsWith('/REBASE_HEAD') ||
    normalized === 'REBASE_HEAD' ||
    normalized.endsWith('/CHERRY_PICK_HEAD') ||
    normalized === 'CHERRY_PICK_HEAD' ||
    normalized.endsWith('/REVERT_HEAD') ||
    normalized === 'REVERT_HEAD' ||
    normalized.endsWith('/BISECT_LOG') ||
    normalized === 'BISECT_LOG'
  ) {
    return true;
  }

  // Active Git operation directories
  if (normalized.includes('/rebase-merge/') || normalized.includes('/rebase-apply/')) {
    return true;
  }

  return false;
}

export interface RepositoryChangeEvent {
  repositoryId: string;
  gitDir: string;
  uri?: vscode.Uri;
  reason: string;
}

export interface RepositoryWatcherOptions {
  debounceMs?: number;
  createWatcher?: (pattern: vscode.GlobPattern) => vscode.FileSystemWatcher;
}

interface TrackedWatcher {
  watcher: vscode.FileSystemWatcher;
  disposables: vscode.Disposable[];
}

/**
 * Watches filesystem changes for Git repository control files:
 * HEAD, refs, packed-refs, logs/HEAD, and transient operation state files (MERGE_HEAD, REBASE_HEAD, etc.).
 * Includes per-repository debouncing to prevent event storms during commits, checkouts, or rebases.
 */
export class RepositoryWatcher implements vscode.Disposable {
  private readonly _debounceMs: number;
  private readonly _createWatcher: (pattern: vscode.GlobPattern) => vscode.FileSystemWatcher;

  private readonly _watchers = new Map<string, TrackedWatcher>();
  private readonly _debounceTimers = new Map<string, NodeJS.Timeout>();

  private readonly _onDidRepositoryChange = new vscode.EventEmitter<RepositoryChangeEvent>();
  public readonly onDidRepositoryChange: vscode.Event<RepositoryChangeEvent> =
    this._onDidRepositoryChange.event;

  public constructor(options?: RepositoryWatcherOptions) {
    this._debounceMs = options?.debounceMs ?? 100;
    this._createWatcher =
      options?.createWatcher ??
      ((pattern: vscode.GlobPattern) => vscode.workspace.createFileSystemWatcher(pattern));
  }

  /**
   * Starts watching Git control files for the specified repository descriptor.
   */
  public watchRepository(repo: RepositoryDescriptor): void {
    if (this._watchers.has(repo.id)) {
      this.unwatchRepository(repo.id);
    }

    if (!repo.gitDir) {
      return;
    }

    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(repo.gitDir),
      '{HEAD,packed-refs,logs/HEAD,MERGE_HEAD,REBASE_HEAD,CHERRY_PICK_HEAD,REVERT_HEAD,BISECT_LOG,refs/**,rebase-merge/**,rebase-apply/**}',
    );

    const watcher = this._createWatcher(pattern);
    const disposables: vscode.Disposable[] = [];

    const handleEvent = (uri: vscode.Uri, eventType: string) => {
      this._handleFileEvent(repo, uri, eventType);
    };

    disposables.push(watcher.onDidChange((uri) => handleEvent(uri, 'change')));
    disposables.push(watcher.onDidCreate((uri) => handleEvent(uri, 'create')));
    disposables.push(watcher.onDidDelete((uri) => handleEvent(uri, 'delete')));
    disposables.push(watcher);

    this._watchers.set(repo.id, { watcher, disposables });
  }

  /**
   * Stops watching the repository with the specified ID.
   */
  public unwatchRepository(repositoryId: string): void {
    this._clearDebounce(repositoryId);

    const tracked = this._watchers.get(repositoryId);
    if (tracked) {
      for (const d of tracked.disposables) {
        d.dispose();
      }
      this._watchers.delete(repositoryId);
    }
  }

  /**
   * Updates watched repositories to match the given list of descriptors.
   */
  public setWatchedRepositories(repositories: RepositoryDescriptor[]): void {
    const currentIds = new Set(this._watchers.keys());
    const nextIds = new Set(repositories.map((r) => r.id));

    // Remove obsolete watchers
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        this.unwatchRepository(id);
      }
    }

    // Add or update watchers
    for (const repo of repositories) {
      if (!this._watchers.has(repo.id)) {
        this.watchRepository(repo);
      }
    }
  }

  /**
   * Returns whether the repository is currently watched.
   */
  public isWatching(repositoryId: string): boolean {
    return this._watchers.has(repositoryId);
  }

  private _handleFileEvent(repo: RepositoryDescriptor, uri: vscode.Uri, eventType: string): void {
    if (!isRelevantGitFile(uri.fsPath)) {
      return;
    }
    this._scheduleDebounce(repo, uri, eventType);
  }

  private _scheduleDebounce(repo: RepositoryDescriptor, uri: vscode.Uri, eventType: string): void {
    this._clearDebounce(repo.id);

    const timer = setTimeout(() => {
      this._debounceTimers.delete(repo.id);
      this._onDidRepositoryChange.fire({
        repositoryId: repo.id,
        gitDir: repo.gitDir,
        uri,
        reason: `fs-${eventType}`,
      });
    }, this._debounceMs);

    this._debounceTimers.set(repo.id, timer);
  }

  private _clearDebounce(repositoryId: string): void {
    const timer = this._debounceTimers.get(repositoryId);
    if (timer) {
      clearTimeout(timer);
      this._debounceTimers.delete(repositoryId);
    }
  }

  public dispose(): void {
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();

    for (const tracked of this._watchers.values()) {
      for (const d of tracked.disposables) {
        d.dispose();
      }
    }
    this._watchers.clear();

    this._onDidRepositoryChange.dispose();
  }
}
