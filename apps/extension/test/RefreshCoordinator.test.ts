import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { RefreshCoordinator, type InvalidationEvent } from '../src/application/RefreshCoordinator';

describe('RefreshCoordinator', () => {
  let coordinator: RefreshCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    coordinator?.dispose();
    vi.useRealTimers();
  });

  it('manages initial generation ID and increments on invalidation', () => {
    coordinator = new RefreshCoordinator();
    expect(coordinator.getGeneration('repo-1')).toBe(1);
    expect(coordinator.isCurrentGeneration('repo-1', 1)).toBe(true);
    expect(coordinator.isCurrentGeneration('repo-1', 2)).toBe(false);

    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    const nextGen = coordinator.invalidate('repo-1', 'fs-change');
    expect(nextGen).toBe(2);
    expect(coordinator.getGeneration('repo-1')).toBe(2);
    expect(coordinator.isCurrentGeneration('repo-1', 2)).toBe(true);

    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      repositoryId: 'repo-1',
      generation: 2,
      reason: 'fs-change',
    });
  });

  it('increments global generation when repositoryId is undefined', () => {
    coordinator = new RefreshCoordinator();
    coordinator.getGeneration('repo-1'); // Initialize repo-1
    coordinator.getGeneration('repo-2'); // Initialize repo-2

    const nextGen = coordinator.invalidate(undefined, 'user-refresh');
    expect(nextGen).toBe(2);
    expect(coordinator.getGeneration('repo-1')).toBe(2);
    expect(coordinator.getGeneration('repo-2')).toBe(2);
  });

  it('coalesces duplicate in-flight queries sharing repositoryId and queryKey', async () => {
    vi.useRealTimers();
    coordinator = new RefreshCoordinator();

    let queryCallCount = 0;
    const slowQuery = async (_gen: number) => {
      queryCallCount += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { commits: ['c1', 'c2'] };
    };

    // Trigger two identical queries concurrently
    const [res1, res2] = await Promise.all([
      coordinator.runQuery('repo-1', 'commits:main:50', slowQuery),
      coordinator.runQuery('repo-1', 'commits:main:50', slowQuery),
    ]);

    expect(queryCallCount).toBe(1);
    expect(res1.result).toEqual({ commits: ['c1', 'c2'] });
    expect(res2.result).toEqual({ commits: ['c1', 'c2'] });
    expect(res1.isStale).toBe(false);
    expect(res2.isStale).toBe(false);
  });

  it('detects and marks query as stale if repository was invalidated during query', async () => {
    vi.useRealTimers();
    coordinator = new RefreshCoordinator();

    const queryWithInvalidation = async () => {
      await new Promise((r) => setTimeout(r, 30));
      // Invalidate while query is executing
      coordinator.invalidate('repo-1', 'fs-change');
      await new Promise((r) => setTimeout(r, 30));
      return 'done';
    };

    const queryResult = await coordinator.runQuery('repo-1', 'commits', queryWithInvalidation);

    expect(queryResult.result).toBe('done');
    expect(queryResult.isStale).toBe(true);
    expect(queryResult.generation).toBe(1);
    expect(coordinator.getGeneration('repo-1')).toBe(2);
  });

  it('handles window focus fallback refresh with throttling', () => {
    const activeId: string | undefined = 'repo-active';
    coordinator = new RefreshCoordinator({
      focusThrottleMs: 1000,
      getActiveRepositoryId: () => activeId,
    });

    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    // First focus event
    coordinator.handleWindowFocus();
    expect(events.length).toBe(1);
    expect(events[0]?.repositoryId).toBe('repo-active');
    expect(events[0]?.reason).toBe('window-focus');

    // Immediate second focus within throttle window should be ignored
    coordinator.handleWindowFocus();
    expect(events.length).toBe(1);

    // After throttle window passes, focus triggers invalidation again
    vi.advanceTimersByTime(1100);
    coordinator.handleWindowFocus();
    expect(events.length).toBe(2);
  });

  it('triggers invalidations on user-initiated refresh requests', () => {
    coordinator = new RefreshCoordinator();
    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    coordinator.requestRefresh('repo-1');
    expect(events.length).toBe(1);
    expect(events[0]?.reason).toBe('user-refresh');

    coordinator.requestRefresh('repo-1', { hard: true });
    expect(events.length).toBe(2);
    expect(events[1]?.reason).toBe('user-hard-refresh');
  });

  it('responds to window state focus events from VS Code window', () => {
    coordinator = new RefreshCoordinator({
      getActiveRepositoryId: () => 'repo-window',
    });

    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    // Simulate VS Code window regaining focus
    const mockWindow = vscode.window as {
      _fireDidChangeWindowState?: (state: { focused: boolean }) => void;
    };
    mockWindow._fireDidChangeWindowState?.({ focused: true });
    expect(events.length).toBe(1);
    expect(events[0]?.repositoryId).toBe('repo-window');
    expect(events[0]?.reason).toBe('window-focus');

    // Lost focus should not trigger
    mockWindow._fireDidChangeWindowState?.({ focused: false });
    expect(events.length).toBe(1);
  });

  it('suppresses repository change events while repository is muted', () => {
    coordinator = new RefreshCoordinator();
    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    coordinator.mute('repo-muted');
    expect(coordinator.isMuted('repo-muted')).toBe(true);

    // Event while muted should be ignored
    coordinator.handleRepositoryChange({
      repositoryId: 'repo-muted',
      gitDir: '/path/.git',
      reason: 'fs-change',
    });
    expect(events.length).toBe(0);

    // Unmute
    coordinator.unmute('repo-muted');
    expect(coordinator.isMuted('repo-muted')).toBe(false);

    // Event after unmute should trigger invalidation
    coordinator.handleRepositoryChange({
      repositoryId: 'repo-muted',
      gitDir: '/path/.git',
      reason: 'fs-change',
    });
    expect(events.length).toBe(1);
    expect(events[0]?.repositoryId).toBe('repo-muted');
  });

  it('suppresses filesystem echo invalidations occurring shortly after operation invalidation', () => {
    vi.useRealTimers();
    coordinator = new RefreshCoordinator();
    const events: InvalidationEvent[] = [];
    coordinator.onDidInvalidate((e) => events.push(e));

    // 1. Operation invalidation fires
    coordinator.invalidate('repo-op', 'operation-branch-create');
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('operation-branch-create');

    // 2. Lingering filesystem watcher debounce fires shortly after
    coordinator.handleRepositoryChange({
      repositoryId: 'repo-op',
      gitDir: '/path/.git',
      reason: 'fs-create',
    });
    // Should be ignored to avoid invalidating the in-flight query triggered by the operation
    expect(events).toHaveLength(1);
  });
});
