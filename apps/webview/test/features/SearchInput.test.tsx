// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchInput } from '../../src/features/search/SearchInput';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('SearchInput', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders disabled when no repositories exist', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(input.getAttribute('aria-label')).toBe('Search commits');

    await act(async () => {
      root.unmount();
    });
  });

  it('debounces search input updates by debounceMs', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    const onSearchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={300} onSearch={onSearchMock} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(input.disabled).toBe(false);

    await act(async () => {
      setInputValue(input, 'feat');
    });

    // Before timer fires
    expect(onSearchMock).not.toHaveBeenCalled();

    // Advance half time
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(onSearchMock).not.toHaveBeenCalled();

    // Advance remaining time
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(onSearchMock).toHaveBeenCalledWith('feat');

    await act(async () => {
      root.unmount();
    });
  });

  it('immediately commits search on Enter key press without waiting for debounce', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    const onSearchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={500} onSearch={onSearchMock} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(input, 'fix');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSearchMock).toHaveBeenCalledWith('fix');

    await act(async () => {
      root.unmount();
    });
  });

  it('clears search immediately on Escape key press', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    const onSearchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={300} onSearch={onSearchMock} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(input, 'quick');
    });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(input.value).toBe('');
    expect(onSearchMock).toHaveBeenCalledWith('');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders clear button when value is present and clears on click', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    const onSearchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={300} onSearch={onSearchMock} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(container.querySelector('[data-testid="search-clear-btn"]')).toBeNull();

    await act(async () => {
      setInputValue(input, 'test query');
    });

    const clearBtn = container.querySelector(
      '[data-testid="search-clear-btn"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.getAttribute('aria-label')).toBe('Clear search');

    await act(async () => {
      clearBtn.click();
    });

    expect(input.value).toBe('');
    expect(onSearchMock).toHaveBeenCalledWith('');
    expect(container.querySelector('[data-testid="search-clear-btn"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('updates searchType in store when selector is changed', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput />);
    });

    const typeSelect = container.querySelector(
      '[data-testid="search-type-select"]',
    ) as HTMLSelectElement;
    expect(typeSelect).toBeTruthy();
    expect(typeSelect.value).toBe('all');

    await act(async () => {
      typeSelect.value = 'author';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGraphStore.getState().searchType).toBe('author');

    await act(async () => {
      root.unmount();
    });
  });

  it('displays match counter and navigates next/prev matches', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);

    useGraphStore.getState().setSearchMatches(['sha-1', 'sha-2', 'sha-3']);

    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={0} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, 'feat');
    });

    const matchCount = container.querySelector('[data-testid="search-match-count"]');
    expect(matchCount).toBeTruthy();
    expect(matchCount?.textContent).toBe('1 of 3');

    // Click Next
    const nextBtn = container.querySelector('[data-testid="search-next-btn"]') as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    await act(async () => {
      nextBtn.click();
    });
    expect(useGraphStore.getState().currentMatchIndex).toBe(1);

    // Click Prev
    const prevBtn = container.querySelector('[data-testid="search-prev-btn"]') as HTMLButtonElement;
    expect(prevBtn).toBeTruthy();
    await act(async () => {
      prevBtn.click();
    });
    expect(useGraphStore.getState().currentMatchIndex).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers search in repository button', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useRepositoryStore.getState().setActiveRepositoryId('repo-1');

    const onSearchRepoMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SearchInput debounceMs={0} onSearchRepo={onSearchRepoMock} />);
    });

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, 'core engine');
    });

    const repoBtn = container.querySelector('[data-testid="search-repo-btn"]') as HTMLButtonElement;
    expect(repoBtn).toBeTruthy();

    await act(async () => {
      repoBtn.click();
    });

    expect(onSearchRepoMock).toHaveBeenCalledWith('core engine');

    await act(async () => {
      root.unmount();
    });
  });
});
