import * as vscode from 'vscode';
import type { RepositoryChangeEvent } from '../watchers/RepositoryWatcher';

export type InvalidationReason =
  | 'fs-change'
  | 'fs-create'
  | 'fs-delete'
  | 'window-focus'
  | 'user-refresh'
  | 'user-hard-refresh'
  | 'repository-changed'
  | string;

export interface InvalidationEvent {
  repositoryId?: string;
  generation: number;
  reason: InvalidationReason;
}

export interface QueryResult<T> {
  result: T;
  generation: number;
  isStale: boolean;
}

export interface RefreshCoordinatorOptions {
  focusThrottleMs?: number;
  getActiveRepositoryId?: () => string | undefined;
}

/**
 * Coordinates graph invalidation and data refresh across Git filesystem events,
 * VS Code window focus fallback, and user requests.
 *
 * Enforces key architectural invariants:
 * 1. Emits graph.invalidated events instead of auto-running heavy duplicate Git queries.
 * 2. Coalesces concurrent in-flight queries sharing the same repository and key.
 * 3. Tracks monotonic generation IDs per repository to detect and discard stale query results.
 */
export class RefreshCoordinator implements vscode.Disposable {
  private readonly _focusThrottleMs: number;
  private readonly _getActiveRepositoryId?: () => string | undefined;

  private readonly _generations = new Map<string, number>();
  private _globalGeneration = 1;
  private _lastFocusTime = 0;

  private readonly _inFlightQueries = new Map<string, Promise<unknown>>();
  private readonly _onDidInvalidate = new vscode.EventEmitter<InvalidationEvent>();
  public readonly onDidInvalidate: vscode.Event<InvalidationEvent> = this._onDidInvalidate.event;

  private readonly _disposables: vscode.Disposable[] = [];

  public constructor(options?: RefreshCoordinatorOptions) {
    this._focusThrottleMs = options?.focusThrottleMs ?? 1000;
    this._getActiveRepositoryId = options?.getActiveRepositoryId;

    // Listen for VS Code window focus changes for fallback refresh
    if (vscode.window.onDidChangeWindowState) {
      const windowSub = vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          this.handleWindowFocus();
        }
      });
      this._disposables.push(windowSub);
    }
  }

  /**
   * Returns current generation ID for the repository (defaults to 1).
   */
  public getGeneration(repositoryId?: string): number {
    if (!repositoryId) {
      return this._globalGeneration;
    }
    const current = this._generations.get(repositoryId);
    if (current === undefined) {
      this._generations.set(repositoryId, 1);
      return 1;
    }
    return current;
  }

  /**
   * Checks whether the given generation matches the repository's current generation.
   */
  public isCurrentGeneration(repositoryId: string, generation: number): boolean {
    return this.getGeneration(repositoryId) === generation;
  }

  /**
   * Increments generation for the repository (or globally if no ID) and fires graph invalidation.
   */
  public invalidate(repositoryId?: string, reason: InvalidationReason = 'fs-change'): number {
    let nextGen: number;
    if (repositoryId) {
      const current = this.getGeneration(repositoryId);
      nextGen = current + 1;
      this._generations.set(repositoryId, nextGen);
      for (const key of Array.from(this._inFlightQueries.keys())) {
        if (key.startsWith(`${repositoryId}::`)) {
          this._inFlightQueries.delete(key);
        }
      }
    } else {
      this._globalGeneration += 1;
      nextGen = this._globalGeneration;
      for (const [id, gen] of this._generations.entries()) {
        this._generations.set(id, gen + 1);
      }
      this._inFlightQueries.clear();
    }

    this._onDidInvalidate.fire({
      repositoryId,
      generation: nextGen,
      reason,
    });

    return nextGen;
  }

  private readonly _mutedRepositories = new Map<string, number>();

  /**
   * Temporarily mutes filesystem/background invalidations for a repository during an active Git operation.
   * Multiple nested operations are counted.
   */
  public mute(repositoryId: string): void {
    const current = this._mutedRepositories.get(repositoryId) || 0;
    this._mutedRepositories.set(repositoryId, current + 1);
  }

  /**
   * Unmutes a repository.
   */
  public unmute(repositoryId: string): void {
    const current = this._mutedRepositories.get(repositoryId) || 0;
    if (current <= 1) {
      this._mutedRepositories.delete(repositoryId);
    } else {
      this._mutedRepositories.set(repositoryId, current - 1);
    }
  }

  public isMuted(repositoryId?: string): boolean {
    if (!repositoryId) {
      return false;
    }
    return (this._mutedRepositories.get(repositoryId) || 0) > 0;
  }

  /**
   * Handles filesystem changes reported by RepositoryWatcher.
   */
  public handleRepositoryChange(event: RepositoryChangeEvent): void {
    if (this.isMuted(event.repositoryId)) {
      return;
    }
    this.invalidate(event.repositoryId, event.reason);
  }

  /**
   * Fallback refresh trigger when VS Code window regains focus.
   * Throttled by focusThrottleMs to avoid spamming invalidations on rapid alt-tabs.
   */
  public handleWindowFocus(activeRepoId?: string): void {
    const now = Date.now();
    if (now - this._lastFocusTime < this._focusThrottleMs) {
      return;
    }
    this._lastFocusTime = now;

    const targetId = activeRepoId ?? this._getActiveRepositoryId?.();
    this.invalidate(targetId, 'window-focus');
  }

  /**
   * User-triggered refresh request.
   */
  public requestRefresh(repositoryId?: string, options?: { hard?: boolean }): number {
    const reason = options?.hard ? 'user-hard-refresh' : 'user-refresh';
    return this.invalidate(repositoryId, reason);
  }

  /**
   * Runs an asynchronous query with coalescing and generation tracking.
   * - If an identical query (same repositoryId and queryKey) is already running, coalesces to the running promise.
   * - Returns whether the completed result is stale (if the repository was invalidated while the query was running).
   */
  public async runQuery<T>(
    repositoryId: string,
    queryKey: string,
    queryFn: (generation: number) => Promise<T>,
  ): Promise<QueryResult<T>> {
    const coalescingKey = `${repositoryId}::${queryKey}`;
    const startGen = this.getGeneration(repositoryId);

    const existing = this._inFlightQueries.get(coalescingKey);
    if (existing) {
      try {
        const res = (await existing) as T;
        const currentGen = this.getGeneration(repositoryId);
        return {
          result: res,
          generation: startGen,
          isStale: startGen !== currentGen,
        };
      } catch {
        // If superseded in-flight query was cancelled/rejected, evict it and run queryFn afresh
        this._inFlightQueries.delete(coalescingKey);
      }
    }

    const queryPromise = (async () => {
      try {
        return await queryFn(startGen);
      } finally {
        this._inFlightQueries.delete(coalescingKey);
      }
    })();

    this._inFlightQueries.set(coalescingKey, queryPromise);

    const result = await queryPromise;
    const currentGen = this.getGeneration(repositoryId);

    return {
      result,
      generation: startGen,
      isStale: startGen !== currentGen,
    };
  }

  /**
   * Returns whether a query for repositoryId and queryKey is currently in-flight.
   */
  public isQueryInFlight(repositoryId: string, queryKey: string): boolean {
    return this._inFlightQueries.has(`${repositoryId}::${queryKey}`);
  }

  public dispose(): void {
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
    this._inFlightQueries.clear();
    this._generations.clear();
    this._onDidInvalidate.dispose();
  }
}
