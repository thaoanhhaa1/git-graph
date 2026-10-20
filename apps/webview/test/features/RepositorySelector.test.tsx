// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RepositorySelector } from '../../src/features/repository/RepositorySelector';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('RepositorySelector', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];
    const mockApi = createMockVsCodeApi(undefined, (msg) => {
      postedMessages.push(msg as MessageEnvelope);
    });
    setVsCodeApi(mockApi);

    useRepositoryStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useRepositoryStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('renders disabled select with placeholder when no repositories exist', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<RepositorySelector />);
    });

    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('aria-label')).toBe('Repository');
    expect(select.options.length).toBe(1);
    expect(select.options[0]?.textContent).toBe('No repository detected');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders options for all repositories and marks active repository selected', async () => {
    useRepositoryStore.getState().setRepositories(
      [
        { id: 'repo-1', name: 'Repo One', path: '/path/one' },
        { id: 'repo-2', name: 'Repo Two', path: '/path/two' },
      ],
      'repo-2',
    );

    const root = createRoot(container);
    await act(async () => {
      root.render(<RepositorySelector />);
    });

    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.options.length).toBe(2);
    expect(select.value).toBe('repo-2');

    await act(async () => {
      root.unmount();
    });
  });

  it('invokes onSelect prop when provided and selection changes', async () => {
    useRepositoryStore.getState().setRepositories(
      [
        { id: 'repo-1', name: 'Repo One', path: '/path/one' },
        { id: 'repo-2', name: 'Repo Two', path: '/path/two' },
      ],
      'repo-1',
    );

    const onSelectMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<RepositorySelector onSelect={onSelectMock} />);
    });

    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'repo-2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSelectMock).toHaveBeenCalledWith('repo-2');

    await act(async () => {
      root.unmount();
    });
  });

  it('disables control when isLoading is true in repositoryStore', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useRepositoryStore.getState().setLoading(true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<RepositorySelector />);
    });

    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
