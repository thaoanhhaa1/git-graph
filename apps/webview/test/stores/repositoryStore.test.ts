import { describe, it, expect, beforeEach } from 'vitest';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { setVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { RepositoryDescriptor } from '@git-graph/shared';

describe('repositoryStore', () => {
  beforeEach(() => {
    setVsCodeApi(createMockVsCodeApi(undefined, () => {}));
    useRepositoryStore.getState().reset();
  });

  const mockRepo1: RepositoryDescriptor = {
    id: 'repo-1',
    name: 'repo-one',
    rootPath: '/work/one',
    gitDir: '/work/one/.git',
    isBare: false,
    currentBranch: 'main',
  };

  const mockRepo2: RepositoryDescriptor = {
    id: 'repo-2',
    name: 'repo-two',
    rootPath: '/work/two',
    gitDir: '/work/two/.git',
    isBare: false,
    currentBranch: 'develop',
  };

  it('initializes with default empty state', () => {
    const state = useRepositoryStore.getState();
    expect(state.repositories).toEqual([]);
    expect(state.activeRepositoryId).toBeNull();
    expect(state.hasBootstrapped).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('sets repositories and defaults active repo to first repo when none specified', () => {
    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2]);

    const state = useRepositoryStore.getState();
    expect(state.repositories).toHaveLength(2);
    expect(state.activeRepositoryId).toBe('repo-1');
    expect(state.getActiveRepository()).toEqual(mockRepo1);
  });

  it('respects preferred active repo if present in list', () => {
    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2], 'repo-2');

    const state = useRepositoryStore.getState();
    expect(state.activeRepositoryId).toBe('repo-2');
    expect(state.getActiveRepository()).toEqual(mockRepo2);
  });

  it('maintains existing active repo if present when updating list', () => {
    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2], 'repo-2');
    expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-2');

    // Update list without specifying preferred
    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2]);
    expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-2');
  });

  it('resets active repo to null if repository list becomes empty', () => {
    useRepositoryStore.getState().setRepositories([mockRepo1]);
    expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-1');

    useRepositoryStore.getState().setRepositories([]);
    expect(useRepositoryStore.getState().activeRepositoryId).toBeNull();
    expect(useRepositoryStore.getState().getActiveRepository()).toBeUndefined();
  });

  it('updates active repo and sets loading/error states', () => {
    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2]);
    useRepositoryStore.getState().setActiveRepositoryId('repo-2');
    expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-2');

    useRepositoryStore.getState().setLoading(true);
    expect(useRepositoryStore.getState().isLoading).toBe(true);

    useRepositoryStore.getState().setError('Failed to load repositories');
    expect(useRepositoryStore.getState().error).toBe('Failed to load repositories');
    expect(useRepositoryStore.getState().isLoading).toBe(false);
  });

  it('marks hasBootstrapped when bootstrap flag is passed', () => {
    expect(useRepositoryStore.getState().hasBootstrapped).toBe(false);
    useRepositoryStore.getState().setRepositories([mockRepo1], undefined, true);
    expect(useRepositoryStore.getState().hasBootstrapped).toBe(true);
  });

  it('persists activeRepositoryId to vscode state', () => {
    let persisted: unknown = null;
    setVsCodeApi({
      postMessage: () => {},
      getState: () => persisted,
      setState: (s) => {
        persisted = s;
        return s;
      },
    });

    useRepositoryStore.getState().setRepositories([mockRepo1, mockRepo2], 'repo-2');
    expect(persisted).toEqual({ activeRepositoryId: 'repo-2' });

    useRepositoryStore.getState().setActiveRepositoryId('repo-1');
    expect(persisted).toEqual({ activeRepositoryId: 'repo-1' });
  });
});
