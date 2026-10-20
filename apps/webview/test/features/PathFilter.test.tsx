// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PathFilter } from '../../src/features/toolbar/PathFilter';
import { useGraphStore } from '../../src/stores/graphStore';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('PathFilter', () => {
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

  it('renders input with default empty path and placeholder', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<PathFilter />);
    });

    const input = container.querySelector('[data-testid="path-filter-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Filter by path...');
    expect(container.querySelector('[data-testid="path-filter-clear-btn"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('applies path filter on Enter key and sends commits.page.request', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<PathFilter />);
    });

    const input = container.querySelector('[data-testid="path-filter-input"]') as HTMLInputElement;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;

    await act(async () => {
      nativeSetter?.call(input, 'src/components/ui/Button.tsx');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(useGraphStore.getState().filterPath).toBe('src/components/ui/Button.tsx');

    const commitReq = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(commitReq).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('reverts value on Escape key', async () => {
    useGraphStore.getState().setFilterPath('initial/path');

    const root = createRoot(container);
    await act(async () => {
      root.render(<PathFilter />);
    });

    const input = container.querySelector('[data-testid="path-filter-input"]') as HTMLInputElement;
    expect(input.value).toBe('initial/path');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;

    await act(async () => {
      nativeSetter?.call(input, 'new/temporary/path');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(input.value).toBe('initial/path');
    expect(useGraphStore.getState().filterPath).toBe('initial/path');

    await act(async () => {
      root.unmount();
    });
  });

  it('clears path filter via clear button click', async () => {
    useGraphStore.getState().setFilterPath('src/main.ts');

    const root = createRoot(container);
    await act(async () => {
      root.render(<PathFilter />);
    });

    const clearBtn = container.querySelector(
      '[data-testid="path-filter-clear-btn"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();

    await act(async () => {
      clearBtn.click();
    });

    expect(useGraphStore.getState().filterPath).toBe('');
    const input = container.querySelector('[data-testid="path-filter-input"]') as HTMLInputElement;
    expect(input.value).toBe('');

    await act(async () => {
      root.unmount();
    });
  });

  it('syncs input value when store filterPath changes from external source', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<PathFilter />);
    });

    const input = container.querySelector('[data-testid="path-filter-input"]') as HTMLInputElement;
    expect(input.value).toBe('');

    await act(async () => {
      useGraphStore.getState().setFilterPath('packages/git-core/src/index.ts');
    });

    expect(input.value).toBe('packages/git-core/src/index.ts');

    await act(async () => {
      root.unmount();
    });
  });
});
