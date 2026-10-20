import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorktreeStore } from '../../src/stores/worktreeStore';
import * as messageRouter from '../../src/messaging/messageRouter';
import type { WorktreeStatus } from '@git-graph/shared';

function createStatus(overrides: Partial<WorktreeStatus> = {}): WorktreeStatus {
  return {
    isClean: false,
    staged: [
      {
        path: 'src/a.ts',
        status: 'modified',
        indexStatus: 'M',
        worktreeStatus: ' ',
        staged: true,
        unstaged: false,
      },
    ],
    unstaged: [
      {
        path: 'README.md',
        status: 'untracked',
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
      },
    ],
    hasConflicts: false,
    head: { sha: 'a'.repeat(40), subject: 'feat: prev', body: '' },
    currentBranch: 'main',
    ...overrides,
  };
}

describe('worktreeStore', () => {
  beforeEach(() => {
    useWorktreeStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('requests status and sets loading for a new repository', () => {
    const requestSpy = vi
      .spyOn(messageRouter, 'requestWorktreeStatus')
      .mockReturnValue('request-1');

    useWorktreeStore.getState().requestStatus('repo-1');

    expect(requestSpy).toHaveBeenCalledWith('repo-1');
    expect(useWorktreeStore.getState().repositoryId).toBe('repo-1');
    expect(useWorktreeStore.getState().isLoading).toBe(true);
  });

  it('receives status and clears loading', () => {
    useWorktreeStore.getState().requestStatus('repo-1');
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());

    const state = useWorktreeStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.status?.staged).toHaveLength(1);
    expect(state.status?.currentBranch).toBe('main');
  });

  it('requests and receives stashes', () => {
    const requestSpy = vi.spyOn(messageRouter, 'requestStashList').mockReturnValue('request-2');

    useWorktreeStore.getState().requestStashes('repo-1');
    expect(requestSpy).toHaveBeenCalledWith('repo-1');
    expect(useWorktreeStore.getState().isLoadingStashes).toBe(true);

    useWorktreeStore
      .getState()
      .receiveStashes('repo-1', [
        { index: 0, ref: 'stash@{0}', sha: 'b'.repeat(40), message: 'WIP on main' },
      ]);
    expect(useWorktreeStore.getState().isLoadingStashes).toBe(false);
    expect(useWorktreeStore.getState().stashes).toHaveLength(1);
  });

  it('records errors and resets all state', () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    useWorktreeStore.getState().setError('boom');

    expect(useWorktreeStore.getState().error).toBe('boom');
    expect(useWorktreeStore.getState().isLoading).toBe(false);

    useWorktreeStore.getState().reset();
    expect(useWorktreeStore.getState()).toMatchObject({
      repositoryId: null,
      status: null,
      stashes: [],
      isLoading: false,
      isLoadingStashes: false,
      error: null,
    });
  });
});
