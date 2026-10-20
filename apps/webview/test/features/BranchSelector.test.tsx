// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BranchSelector } from '../../src/features/toolbar/BranchSelector';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope, Commit } from '@git-graph/shared';

describe('BranchSelector', () => {
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

  it('renders disabled when there are no repositories', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<BranchSelector />);
    });

    const select = container.querySelector('[data-testid="branch-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('aria-label')).toBe('Filter by branch');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders branch options including current branch and commit refs', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'feature/login' },
      ]);

    const mockCommits: Commit[] = [
      {
        sha: '1111111111111111111111111111111111111111',
        shortSha: '1111111',
        parents: [],
        author: { name: 'Alice', email: 'alice@example.com', timestamp: 1000, timezone: '+0000' },
        committer: {
          name: 'Alice',
          email: 'alice@example.com',
          timestamp: 1000,
          timezone: '+0000',
        },
        subject: 'Commit 1',
        refs: [
          {
            name: 'develop',
            fullName: 'refs/heads/develop',
            target: '1111111111111111111111111111111111111111',
            kind: 'localBranch',
          },
          {
            name: 'v1.0.0',
            fullName: 'refs/tags/v1.0.0',
            target: '1111111111111111111111111111111111111111',
            kind: 'tag',
          },
        ],
      },
    ];

    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: { commits: mockCommits, hasMore: false },
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<BranchSelector />);
    });

    const select = container.querySelector('[data-testid="branch-select"]') as HTMLSelectElement;
    expect(select.disabled).toBe(false);

    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('all');
    expect(optionValues).toContain('feature/login');
    expect(optionValues).toContain('develop');

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers branch selection and sends commits.page.request', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);

    const root = createRoot(container);
    await act(async () => {
      root.render(<BranchSelector />);
    });

    const select = container.querySelector('[data-testid="branch-select"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'main';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGraphStore.getState().selectedBranch).toBe('main');
    const reqMsg = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(reqMsg).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('calls onSelectBranch callback when provided', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);

    const onSelectBranchMock = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<BranchSelector onSelectBranch={onSelectBranchMock} />);
    });

    const select = container.querySelector('[data-testid="branch-select"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'main';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSelectBranchMock).toHaveBeenCalledWith('main');

    await act(async () => {
      root.unmount();
    });
  });
});
