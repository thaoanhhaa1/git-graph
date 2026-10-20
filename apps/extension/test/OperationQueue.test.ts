import { describe, it, expect, beforeEach } from 'vitest';
import { AppErrorCode } from '@git-graph/shared';
import { OperationQueue } from '../src/operations/OperationQueue';

describe('OperationQueue', () => {
  let queue: OperationQueue;

  beforeEach(() => {
    queue = new OperationQueue();
  });

  it('runs tasks sequentially for the same repository', async () => {
    const executionOrder: string[] = [];
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const task1 = queue.enqueue('repo-1', 'op-1', 'checkout', async () => {
      executionOrder.push('task1-start');
      await firstPromise;
      executionOrder.push('task1-end');
      return 'res1';
    });

    const task2 = queue.enqueue('repo-1', 'op-2', 'branch', async () => {
      executionOrder.push('task2-start');
      executionOrder.push('task2-end');
      return 'res2';
    });

    expect(queue.isOperationRunning('repo-1')).toBe(true);
    expect(queue.getRunningOperation('repo-1')).toEqual({ operationId: 'op-1', type: 'checkout' });
    expect(queue.getQueuedCount('repo-1')).toBe(1);

    // task 1 has started, but task 2 must NOT have started yet
    await new Promise((r) => setTimeout(r, 10));
    expect(executionOrder).toEqual(['task1-start']);

    // Now resolve task 1
    resolveFirst();
    const res1 = await task1;
    const res2 = await task2;

    expect(res1).toBe('res1');
    expect(res2).toBe('res2');
    expect(executionOrder).toEqual(['task1-start', 'task1-end', 'task2-start', 'task2-end']);
    expect(queue.isOperationRunning('repo-1')).toBe(false);
    expect(queue.getQueuedCount('repo-1')).toBe(0);
  });

  it('allows concurrent execution across different repositories', async () => {
    const active = new Set<string>();
    let maxConcurrent = 0;

    const makeTask = (repoId: string, opId: string) =>
      queue.enqueue(repoId, opId, 'test', async () => {
        active.add(repoId);
        maxConcurrent = Math.max(maxConcurrent, active.size);
        await new Promise((r) => setTimeout(r, 30));
        active.delete(repoId);
        return repoId;
      });

    const [r1, r2] = await Promise.all([makeTask('repo-A', 'op-A'), makeTask('repo-B', 'op-B')]);

    expect(r1).toBe('repo-A');
    expect(r2).toBe('repo-B');
    expect(maxConcurrent).toBe(2);
  });

  it('aborts active task via signal when cancelOperation is called', async () => {
    let observedAborted = false;

    const task = queue.enqueue('repo-1', 'op-cancel', 'checkout', async (signal) => {
      return new Promise<string>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          observedAborted = true;
          reject(new Error('Aborted!'));
        });
      });
    });

    expect(queue.isOperationRunning('repo-1')).toBe(true);
    const cancelled = queue.cancelOperation('op-cancel');
    expect(cancelled).toBe(true);

    await expect(task).rejects.toThrow();
    expect(observedAborted).toBe(true);
    expect(queue.isOperationRunning('repo-1')).toBe(false);
  });

  it('dequeues and rejects a queued operation before it starts', async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const task1 = queue.enqueue('repo-1', 'op-1', 'checkout', async () => {
      await firstPromise;
      return 'task1-done';
    });

    let task2Started = false;
    const task2 = queue.enqueue('repo-1', 'op-2', 'branch', async () => {
      task2Started = true;
      return 'task2-done';
    });

    expect(queue.getQueuedCount('repo-1')).toBe(1);

    // Cancel op-2 while it is still waiting in queue
    const cancelled = queue.cancelOperation('op-2');
    expect(cancelled).toBe(true);
    expect(queue.getQueuedCount('repo-1')).toBe(0);

    // op-2 should reject with OPERATION_CANCELLED
    await expect(task2).rejects.toMatchObject({
      code: AppErrorCode.OPERATION_CANCELLED,
    });
    expect(task2Started).toBe(false);

    // op-1 completes normally
    resolveFirst();
    const res1 = await task1;
    expect(res1).toBe('task1-done');
  });

  it('returns false when trying to cancel an unknown operation', () => {
    expect(queue.cancelOperation('unknown-id')).toBe(false);
  });

  it('cancels all active and queued operations when disposed', async () => {
    const task1 = queue.enqueue('repo-1', 'op-1', 'checkout', async (signal) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Queue disposed')));
      });
    });

    const task2 = queue.enqueue('repo-1', 'op-2', 'branch', async () => {
      return 'done';
    });

    queue.dispose();

    await expect(task1).rejects.toThrow();
    await expect(task2).rejects.toMatchObject({
      code: AppErrorCode.OPERATION_CANCELLED,
    });
    expect(queue.getActiveOperationIds().length).toBe(0);
  });
});
