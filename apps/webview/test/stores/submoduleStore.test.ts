import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubmoduleStore } from '../../src/stores/submoduleStore';
import * as messageRouter from '../../src/messaging/messageRouter';

describe('submoduleStore', () => {
  beforeEach(() => {
    useSubmoduleStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('requests submodules and marks loading for a new repository', () => {
    const requestSpy = vi
      .spyOn(messageRouter, 'requestSubmoduleList')
      .mockReturnValue('submodule-list-1');

    useSubmoduleStore.getState().requestSubmodules('repo-1');

    expect(requestSpy).toHaveBeenCalledWith('repo-1');
    expect(useSubmoduleStore.getState().isLoading).toBe(true);
  });

  it('receives submodules and clears loading', () => {
    useSubmoduleStore.getState().requestSubmodules('repo-1');
    useSubmoduleStore
      .getState()
      .receiveSubmodules('repo-1', [
        { name: 'libs/core', path: 'libs/core', state: 'dirty', ahead: 2, behind: 1 },
      ]);

    const state = useSubmoduleStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.submodules).toHaveLength(1);
    expect(state.submodules[0]?.state).toBe('dirty');
  });

  it('records errors and resets all state', () => {
    useSubmoduleStore.getState().requestSubmodules('repo-1');
    useSubmoduleStore.getState().setError('boom');

    expect(useSubmoduleStore.getState().error).toBe('boom');
    expect(useSubmoduleStore.getState().isLoading).toBe(false);

    useSubmoduleStore.getState().reset();
    expect(useSubmoduleStore.getState()).toMatchObject({
      repositoryId: null,
      submodules: [],
      error: null,
    });
  });
});
