import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitWorktreeStore } from '../../src/stores/gitWorktreeStore';
import * as messageRouter from '../../src/messaging/messageRouter';

describe('gitWorktreeStore', () => {
  beforeEach(() => {
    useGitWorktreeStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('requests worktrees and marks loading for a new repository', () => {
    const requestSpy = vi
      .spyOn(messageRouter, 'requestGitWorktreeList')
      .mockReturnValue('worktree-list-1');

    useGitWorktreeStore.getState().requestWorktrees('repo-1');

    expect(requestSpy).toHaveBeenCalledWith('repo-1');
    expect(useGitWorktreeStore.getState()).toMatchObject({
      repositoryId: 'repo-1',
      isLoading: true,
      error: null,
    });
  });

  it('receives worktrees and current path', () => {
    useGitWorktreeStore.getState().requestWorktrees('repo-1');
    useGitWorktreeStore.getState().receiveWorktrees(
      'repo-1',
      [
        { path: '/repos/main', branch: 'main', isCurrent: true },
        { path: '/repos/feature', branch: 'feature' },
      ],
      '/repos/main',
    );

    const state = useGitWorktreeStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.worktrees).toHaveLength(2);
    expect(state.currentPath).toBe('/repos/main');
  });

  it('records errors and resets all state', () => {
    useGitWorktreeStore.getState().requestWorktrees('repo-1');
    useGitWorktreeStore.getState().setError('boom');

    expect(useGitWorktreeStore.getState().error).toBe('boom');
    expect(useGitWorktreeStore.getState().isLoading).toBe(false);

    useGitWorktreeStore.getState().reset();
    expect(useGitWorktreeStore.getState()).toMatchObject({
      repositoryId: null,
      worktrees: [],
      currentPath: undefined,
      error: null,
    });
  });
});
