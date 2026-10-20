import * as vscode from 'vscode';
import { AppError, AppErrorCode } from '@git-graph/shared';

interface QueueItem<T = unknown> {
  operationId: string;
  type: string;
  task: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface ActiveOperation {
  operationId: string;
  type: string;
  controller: AbortController;
}

interface TrackedOperation {
  controller: AbortController;
  repositoryId: string;
  type: string;
  status: 'queued' | 'running';
  reject?: (err: unknown) => void;
}

/**
 * Manages serialization of mutating Git operations per repository.
 * Ensures that for any given repository, at most one mutating operation executes
 * at any given time, avoiding index.lock collisions and state corruption.
 */
export class OperationQueue implements vscode.Disposable {
  private readonly _queues = new Map<string, QueueItem[]>();
  private readonly _activeOperations = new Map<string, ActiveOperation>();
  private readonly _trackedOperations = new Map<string, TrackedOperation>();
  private _isDisposed = false;

  /**
   * Enqueues a mutating operation for execution on a specific repository.
   * Tasks are processed sequentially (FIFO) per repository.
   */
  public enqueue<T>(
    repositoryId: string,
    operationId: string,
    type: string,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this._isDisposed) {
      return Promise.reject(
        new AppError(AppErrorCode.OPERATION_CANCELLED, 'Operation queue is disposed.'),
      );
    }

    const controller = new AbortController();

    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = {
        operationId,
        type,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      this._trackedOperations.set(operationId, {
        controller,
        repositoryId,
        type,
        status: 'queued',
        reject,
      });

      const queue = this._queues.get(repositoryId) ?? [];
      queue.push(queueItem as QueueItem);
      this._queues.set(repositoryId, queue);

      // Process next if repository is currently idle
      if (!this._activeOperations.has(repositoryId)) {
        this._processNext(repositoryId);
      }
    });
  }

  /**
   * Processes the next task in line for the specified repository.
   */
  private _processNext(repositoryId: string): void {
    if (this._isDisposed) {
      return;
    }

    const queue = this._queues.get(repositoryId);
    if (!queue || queue.length === 0) {
      this._queues.delete(repositoryId);
      this._activeOperations.delete(repositoryId);
      return;
    }

    const item = queue.shift()!;
    const tracked = this._trackedOperations.get(item.operationId);
    if (!tracked) {
      // Operation might have been cancelled while queued
      this._processNext(repositoryId);
      return;
    }

    tracked.status = 'running';
    const active: ActiveOperation = {
      operationId: item.operationId,
      type: item.type,
      controller: tracked.controller,
    };
    this._activeOperations.set(repositoryId, active);

    void (async () => {
      try {
        const result = await item.task(tracked.controller.signal);
        item.resolve(result);
      } catch (err: unknown) {
        if (tracked.controller.signal.aborted) {
          item.reject(
            new AppError(AppErrorCode.OPERATION_CANCELLED, 'Operation was cancelled.', err),
          );
        } else {
          item.reject(err);
        }
      } finally {
        this._trackedOperations.delete(item.operationId);
        this._activeOperations.delete(repositoryId);
        this._processNext(repositoryId);
      }
    })();
  }

  /**
   * Cancels an active or queued operation by its operation ID.
   * Returns true if operation was found and cancelled, false otherwise.
   */
  public cancelOperation(operationId: string): boolean {
    const tracked = this._trackedOperations.get(operationId);
    if (!tracked) {
      return false;
    }

    // Abort controller signal
    tracked.controller.abort();

    if (tracked.status === 'queued') {
      // Remove from queue
      const queue = this._queues.get(tracked.repositoryId);
      if (queue) {
        const idx = queue.findIndex((q) => q.operationId === operationId);
        if (idx !== -1) {
          queue.splice(idx, 1);
        }
        if (queue.length === 0) {
          this._queues.delete(tracked.repositoryId);
        }
      }

      tracked.reject?.(
        new AppError(AppErrorCode.OPERATION_CANCELLED, 'Operation was cancelled before starting.'),
      );
      this._trackedOperations.delete(operationId);
    }

    return true;
  }

  /**
   * Checks whether a mutating operation is currently running on the specified repository.
   */
  public isOperationRunning(repositoryId: string): boolean {
    return this._activeOperations.has(repositoryId);
  }

  /**
   * Returns running operation metadata for the specified repository, if any.
   */
  public getRunningOperation(
    repositoryId: string,
  ): { operationId: string; type: string } | undefined {
    const active = this._activeOperations.get(repositoryId);
    return active ? { operationId: active.operationId, type: active.type } : undefined;
  }

  /**
   * Returns the number of queued operations waiting for the specified repository.
   */
  public getQueuedCount(repositoryId: string): number {
    return this._queues.get(repositoryId)?.length ?? 0;
  }

  /**
   * Returns all active and queued operation IDs.
   */
  public getActiveOperationIds(): string[] {
    return Array.from(this._trackedOperations.keys());
  }

  /**
   * Disposes the queue and cancels all pending/in-flight operations.
   */
  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;

    // Abort and reject all tracked operations
    for (const [id, tracked] of this._trackedOperations.entries()) {
      tracked.controller.abort();
      tracked.reject?.(
        new AppError(AppErrorCode.OPERATION_CANCELLED, 'Operation queue was disposed.'),
      );
      this._trackedOperations.delete(id);
    }

    this._queues.clear();
    this._activeOperations.clear();
  }
}
