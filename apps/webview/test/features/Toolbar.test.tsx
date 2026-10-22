// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Toolbar } from '../../src/features/toolbar/Toolbar';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('Toolbar', () => {
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
    useGraphStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('renders toolbar with accessible role and aria-label', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar />);
    });

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.getAttribute('aria-label')).toBe('Git Graph Toolbar');

    expect(container.querySelector('[data-testid="repo-select"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="branch-select"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="toolbar-fetch-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="toolbar-refresh-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="search-input"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders stash actions and invokes their callbacks', async () => {
    const onStash = vi.fn();
    const onManageStashes = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar onStash={onStash} onManageStashes={onManageStashes} />);
    });

    await act(async () => {
      (container.querySelector('[data-testid="toolbar-stash-btn"]') as HTMLButtonElement).click();
    });
    expect(onStash).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        container.querySelector('[data-testid="toolbar-stash-manager-btn"]') as HTMLButtonElement
      ).click();
    });
    expect(onManageStashes).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('invokes onRefresh callback when refresh button is clicked', async () => {
    const onRefreshMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar onRefresh={onRefreshMock} />);
    });

    const refreshBtn = container.querySelector(
      '[data-testid="toolbar-refresh-btn"]',
    ) as HTMLButtonElement;
    expect(refreshBtn).toBeTruthy();

    await act(async () => {
      refreshBtn.click();
    });

    expect(onRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders and invokes pull, push, and manage-remotes actions', async () => {
    const onPull = vi.fn();
    const onPush = vi.fn();
    const onManageRemotes = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar onPull={onPull} onPush={onPush} onManageRemotes={onManageRemotes} />);
    });

    await act(async () => {
      (container.querySelector('[data-testid="toolbar-pull-btn"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-testid="toolbar-push-btn"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (
        container.querySelector('[data-testid="toolbar-manage-remotes-btn"]') as HTMLButtonElement
      ).click();
    });

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onPush).toHaveBeenCalledTimes(1);
    expect(onManageRemotes).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('shows spinning loading indicator and disables refresh button when loading', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });

    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar />);
    });

    const loadingIndicator = container.querySelector('[data-testid="toolbar-loading-indicator"]');
    expect(loadingIndicator).toBeTruthy();
    expect(loadingIndicator?.getAttribute('role')).toBe('status');

    const refreshBtn = container.querySelector(
      '[data-testid="toolbar-refresh-btn"]',
    ) as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('clears error and requests graph refresh when refresh button clicked without onRefresh prop', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().setError('Some graph error');

    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar />);
    });

    const refreshBtn = container.querySelector(
      '[data-testid="toolbar-refresh-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      refreshBtn.click();
    });

    expect(useGraphStore.getState().error).toBeNull();
    const refreshMsg = postedMessages.find((m) => m.type === 'graph.refresh.request');
    expect(refreshMsg).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('invokes onFetch callback when fetch button is clicked', async () => {
    const onFetchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar onFetch={onFetchMock} />);
    });

    const fetchBtn = container.querySelector(
      '[data-testid="toolbar-fetch-btn"]',
    ) as HTMLButtonElement;
    expect(fetchBtn).toBeTruthy();

    await act(async () => {
      fetchBtn.click();
    });

    expect(onFetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('clears error and requests fetch when fetch button clicked without onFetch prop', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().setError('Stale error');

    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar />);
    });

    const fetchBtn = container.querySelector(
      '[data-testid="toolbar-fetch-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      fetchBtn.click();
    });

    expect(useGraphStore.getState().error).toBeNull();
    const fetchMsg = postedMessages.find((m) => m.type === 'operation.fetch.request');
    expect(fetchMsg).toBeDefined();
    expect((fetchMsg?.payload as { repositoryId: string }).repositoryId).toBe('repo-1');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders circular spin loading indicator inside fetch button when isFetching is true', async () => {
    useGraphStore.getState().setIsFetching(true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<Toolbar />);
    });

    const fetchBtn = container.querySelector(
      '[data-testid="toolbar-fetch-btn"]',
    ) as HTMLButtonElement;
    expect(fetchBtn).toBeTruthy();
    expect(fetchBtn.disabled).toBe(true);
    expect(container.querySelector('[data-testid="fetch-spinner"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});
