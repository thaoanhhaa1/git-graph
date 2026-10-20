import * as vscode from 'vscode';
import type { Commit } from '@git-graph/shared';
import type { RepositoryManager } from '../repositories/RepositoryManager';
import type { RefreshCoordinator } from './RefreshCoordinator';

export interface CommitDetailsControllerOptions {
  repositoryManager: RepositoryManager;
  refreshCoordinator?: RefreshCoordinator;
  maxCacheSize?: number;
}

/**
 * Controller responsible for retrieving, caching, and coalescing commit details
 * across repositories in the Extension Host.
 */
export class CommitDetailsController implements vscode.Disposable {
  private readonly _repositoryManager: RepositoryManager;
  private readonly _refreshCoordinator?: RefreshCoordinator;
  private readonly _maxCacheSize: number;

  // Cache key format: `${repositoryId}::${sha}::${parentSha ?? ''}`
  private readonly _cache = new Map<string, Commit>();
  private readonly _inFlight = new Map<string, Promise<Commit | null>>();
  private readonly _disposables: vscode.Disposable[] = [];

  public constructor(options: CommitDetailsControllerOptions) {
    this._repositoryManager = options.repositoryManager;
    this._refreshCoordinator = options.refreshCoordinator;
    this._maxCacheSize = options.maxCacheSize ?? 500;

    if (this._refreshCoordinator) {
      const invalidateSub = this._refreshCoordinator.onDidInvalidate((event) => {
        this.clearCache(event.repositoryId);
      });
      this._disposables.push(invalidateSub);
    }
  }

  /**
   * Generates a unique cache key for repository, commit SHA, and optional comparison parent SHA.
   */
  public static buildCacheKey(repositoryId: string, sha: string, parentSha?: string): string {
    return `${repositoryId}::${sha}::${parentSha ?? ''}`;
  }

  /**
   * Fetches detailed commit info (metadata, author, committer, subject/body, file changes, stats).
   * Automatically uses cached result if available, or coalesces duplicate concurrent queries.
   */
  public async getCommitDetails(
    repositoryId: string,
    sha: string,
    parentSha?: string,
  ): Promise<Commit | null> {
    if (!repositoryId || !sha) {
      return null;
    }

    const key = CommitDetailsController.buildCacheKey(repositoryId, sha, parentSha);

    // 1. Check in-memory cache
    const cached = this._cache.get(key);
    if (cached) {
      return cached;
    }

    // 2. Coalesce duplicate in-flight requests
    const inFlight = this._inFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const repo = this._repositoryManager.getRepository(repositoryId);
        if (!repo) {
          return null;
        }

        const commit = parentSha
          ? await repo.getCommitDetails(sha, { parentSha })
          : await repo.getCommitDetails(sha);

        if (commit) {
          this._setCache(key, commit);
        }

        return commit;
      } finally {
        this._inFlight.delete(key);
      }
    })();

    this._inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Returns cached commit details if present.
   */
  public getCached(repositoryId: string, sha: string, parentSha?: string): Commit | undefined {
    const key = CommitDetailsController.buildCacheKey(repositoryId, sha, parentSha);
    return this._cache.get(key);
  }

  /**
   * Clears cached commit details for a specific repository, or for all repositories.
   */
  public clearCache(repositoryId?: string): void {
    if (!repositoryId) {
      this._cache.clear();
      return;
    }

    const prefix = `${repositoryId}::`;
    for (const key of Array.from(this._cache.keys())) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
      }
    }
  }

  /**
   * Stores commit details in cache with LRU eviction when size exceeds limit.
   */
  private _setCache(key: string, commit: Commit): void {
    if (this._cache.size >= this._maxCacheSize) {
      // Evict oldest entry (first key in Map iterator)
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey) {
        this._cache.delete(oldestKey);
      }
    }
    this._cache.set(key, commit);
  }

  public dispose(): void {
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
    this._cache.clear();
    this._inFlight.clear();
  }
}
