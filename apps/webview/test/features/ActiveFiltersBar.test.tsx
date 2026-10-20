// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActiveFiltersBar } from '../../src/features/search/ActiveFiltersBar';
import { useGraphStore } from '../../src/stores/graphStore';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('ActiveFiltersBar', () => {
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
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().reset();
    useGraphStore.getState().setActiveRepoId('repo-1');

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

  it('renders nothing when no filters are active', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ActiveFiltersBar />);
    });

    expect(container.querySelector('[data-testid="active-filters-bar"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders branch filter chip and clears branch on chip remove click', async () => {
    useGraphStore.getState().setSelectedBranch('feature/auth');

    const root = createRoot(container);
    await act(async () => {
      root.render(<ActiveFiltersBar />);
    });

    const bar = container.querySelector('[data-testid="active-filters-bar"]');
    expect(bar).toBeTruthy();

    const branchChip = container.querySelector('[data-testid="filter-chip-branch"]');
    expect(branchChip).toBeTruthy();
    expect(branchChip?.textContent).toContain('feature/auth');

    const removeBtn = container.querySelector(
      '[data-testid="remove-filter-branch"]',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();

    await act(async () => {
      removeBtn.click();
    });

    expect(useGraphStore.getState().selectedBranch).toBe('all');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders search, author, and date filter chips', async () => {
    useGraphStore.getState().setSearchTerm('initial commit', { resetCommits: false });
    useGraphStore.getState().setSearchType('subject');
    useGraphStore.getState().setFilterAuthor('Alice');
    useGraphStore.getState().setFilterDateRange('2024-01-01', '2024-12-31');

    const root = createRoot(container);
    await act(async () => {
      root.render(<ActiveFiltersBar />);
    });

    expect(container.querySelector('[data-testid="filter-chip-search"]')?.textContent).toContain(
      'initial commit',
    );
    expect(container.querySelector('[data-testid="filter-chip-author"]')?.textContent).toContain(
      'Alice',
    );
    expect(container.querySelector('[data-testid="filter-chip-date"]')?.textContent).toContain(
      '2024-01-01',
    );

    // Remove author
    const removeAuthorBtn = container.querySelector(
      '[data-testid="remove-filter-author"]',
    ) as HTMLButtonElement;
    await act(async () => {
      removeAuthorBtn.click();
    });
    expect(useGraphStore.getState().filterAuthor).toBe('');

    await act(async () => {
      root.unmount();
    });
  });

  it('clears all active filters when Clear all button is clicked', async () => {
    useGraphStore.getState().setSelectedBranch('feature/payments');
    useGraphStore.getState().setSearchTerm('stripe', { resetCommits: false });
    useGraphStore.getState().setFilterAuthor('Bob');

    const root = createRoot(container);
    await act(async () => {
      root.render(<ActiveFiltersBar />);
    });

    const clearAllBtn = container.querySelector(
      '[data-testid="clear-all-filters-btn"]',
    ) as HTMLButtonElement;
    expect(clearAllBtn).toBeTruthy();

    await act(async () => {
      clearAllBtn.click();
    });

    const state = useGraphStore.getState();
    expect(state.selectedBranch).toBe('all');
    expect(state.searchTerm).toBe('');
    expect(state.filterAuthor).toBe('');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders path filter chip and clears path on chip remove click', async () => {
    useGraphStore.getState().setFilterPath('src/components/ui/Button.tsx');

    const root = createRoot(container);
    await act(async () => {
      root.render(<ActiveFiltersBar />);
    });

    const pathChip = container.querySelector('[data-testid="filter-chip-path"]');
    expect(pathChip).toBeTruthy();
    expect(pathChip?.textContent).toContain('src/components/ui/Button.tsx');

    const removeBtn = container.querySelector(
      '[data-testid="remove-filter-path"]',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();

    await act(async () => {
      removeBtn.click();
    });

    expect(useGraphStore.getState().filterPath).toBe('');

    await act(async () => {
      root.unmount();
    });
  });
});
