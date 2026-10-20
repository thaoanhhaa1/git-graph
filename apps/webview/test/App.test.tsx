// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/App';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../src/messaging/vscodeApi';
import { useRepositoryStore } from '../src/stores/repositoryStore';
import { useGraphStore } from '../src/stores/graphStore';
import type { AppBootstrapMessage, MessageEnvelope } from '@git-graph/shared';

describe('App component', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];

    const mockApi = createMockVsCodeApi(undefined, (msg) => {
      postedMessages.push(msg as MessageEnvelope);
    });
    setVsCodeApi(mockApi);

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('is a valid React component function', () => {
    expect(typeof App).toBe('function');
  });

  it('dispatches app.ready to extension host on mount', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    expect(postedMessages.length).toBeGreaterThanOrEqual(1);
    const readyMsg = postedMessages.find((m) => m.type === 'app.ready');
    expect(readyMsg).toBeDefined();
    expect(readyMsg?.protocolVersion).toBe(1);
    expect(readyMsg?.payload).toHaveProperty('timestamp');

    await act(async () => {
      root.unmount();
    });
  });

  it('receives app.bootstrap message and updates repository placeholder UI', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const repoNameEl = container.querySelector('[data-testid="repo-name"]');
    expect(repoNameEl?.textContent).toBe('Git Graph Workspace');

    // Simulate Extension Host dispatching app.bootstrap
    const bootstrapMessage: AppBootstrapMessage = {
      protocolVersion: 1,
      id: 'bootstrap-msg-1',
      type: 'app.bootstrap',
      payload: {
        protocolVersion: 1,
        repositories: [
          {
            id: 'repo-git-graph',
            name: 'git-graph-project',
            path: '/workspace/git-graph-project',
            currentBranch: 'feature/m0-bootstrap',
          },
          {
            id: 'repo-secondary',
            name: 'secondary-repo',
            path: '/workspace/secondary-repo',
            currentBranch: 'main',
          },
        ],
        activeRepositoryId: 'repo-git-graph',
        theme: 'dark',
      },
    };

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: bootstrapMessage,
        }),
      );
    });

    // Check repository banner updated
    expect(container.querySelector('[data-testid="repo-name"]')?.textContent).toBe(
      'git-graph-project',
    );
    expect(container.querySelector('[data-testid="repo-branch-pill"]')?.textContent).toContain(
      'feature/m0-bootstrap',
    );
    expect(container.querySelector('[data-testid="repo-path"]')?.textContent).toBe(
      '/workspace/git-graph-project',
    );

    // Check status bar updated
    expect(container.querySelector('[data-testid="status-text"]')?.textContent).toBe(
      'Connected (Protocol v1)',
    );

    // Check repository select options
    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0]?.textContent).toBe('git-graph-project');
    expect(select.options[1]?.textContent).toBe('secondary-repo');

    await act(async () => {
      root.unmount();
    });
  });

  it('allows selecting commit rows by click and keyboard', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [
          {
            sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            shortSha: 'a1b2c3d',
            parents: [],
            author: {
              name: 'Alice',
              email: 'alice@example.com',
              timestamp: 1000,
              timezone: '+0000',
            },
            committer: {
              name: 'Alice',
              email: 'alice@example.com',
              timestamp: 1000,
              timezone: '+0000',
            },
            subject: 'Commit 1',
            refs: [],
          },
          {
            sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c',
            shortSha: 'b2c3d4e',
            parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
            author: { name: 'Bob', email: 'bob@example.com', timestamp: 2000, timezone: '+0000' },
            committer: {
              name: 'Bob',
              email: 'bob@example.com',
              timestamp: 2000,
              timezone: '+0000',
            },
            subject: 'Commit 2',
            refs: [],
          },
          {
            sha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d',
            shortSha: 'c3d4e5f',
            parents: ['b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c'],
            author: {
              name: 'Charlie',
              email: 'charlie@example.com',
              timestamp: 3000,
              timezone: '+0000',
            },
            committer: {
              name: 'Charlie',
              email: 'charlie@example.com',
              timestamp: 3000,
              timezone: '+0000',
            },
            subject: 'Commit 3',
            refs: [],
          },
        ],
        hasMore: false,
      },
    });

    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const row2 = container.querySelector(
      '[data-testid="commit-row-b2c3d4e"]',
    ) as HTMLTableRowElement;
    expect(row2).toBeTruthy();
    expect(row2.classList.contains('selected')).toBe(false);

    // Click to select
    await act(async () => {
      row2.click();
    });
    expect(row2.classList.contains('selected')).toBe(true);

    // Press key to select another row
    const row3 = container.querySelector(
      '[data-testid="commit-row-c3d4e5f"]',
    ) as HTMLTableRowElement;
    await act(async () => {
      row3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(row3.classList.contains('selected')).toBe(true);
    expect(row2.classList.contains('selected')).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('filters commit placeholder list via search input', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const searchInput = container.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      // Input search filter
      searchInput.value = 'theme';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      // In React controlled inputs:
      const tracker = (
        searchInput as unknown as { _valueTracker?: { setValue(val: string): void } }
      )._valueTracker;
      if (tracker) {
        tracker.setValue('');
      }
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('safely ignores invalid extension messages without crashing or throwing', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: null }));
      window.dispatchEvent(new MessageEvent('message', { data: 'not-an-object' }));
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { protocolVersion: 1, id: '1', type: 'unknown.message', payload: {} },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            protocolVersion: 1,
            id: '2',
            type: 'app.bootstrap',
            payload: { repositories: 'invalid' },
          },
        }),
      );
    });

    // App should still be rendered healthy
    expect(container.querySelector('[data-testid="repo-name"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders dedicated empty state when no repositories are found', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Simulate Extension Host dispatching bootstrap with 0 repositories
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            protocolVersion: 1,
            id: 'boot-empty',
            type: 'app.bootstrap',
            payload: {
              protocolVersion: 1,
              repositories: [],
              theme: 'dark',
            },
          },
        }),
      );
    });

    const emptyState = container.querySelector('[data-testid="empty-repo-state"]');
    expect(emptyState).toBeTruthy();
    expect(container.querySelector('[data-testid="empty-state-title"]')?.textContent).toBe(
      'No Git Repositories Found',
    );
    expect(container.querySelector('[data-testid="empty-state-desc"]')?.textContent).toContain(
      'does not contain any Git repositories',
    );

    // Refresh button in empty state
    const refreshBtn = container.querySelector(
      '[data-testid="empty-state-refresh-btn"]',
    ) as HTMLButtonElement;
    expect(refreshBtn).toBeTruthy();

    await act(async () => {
      refreshBtn.click();
    });

    const refreshReq = postedMessages.find((m) => m.type === 'repositories.list.request');
    expect(refreshReq).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('handles repositories.list.result and updates repository selection', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Receive repositories.list.result
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            protocolVersion: 1,
            id: 'res-list-1',
            type: 'repositories.list.result',
            payload: {
              repositories: [
                {
                  id: 'repo-alpha',
                  name: 'Repo Alpha',
                  rootPath: '/work/alpha',
                  gitDir: '/work/alpha/.git',
                  isBare: false,
                  currentBranch: 'main',
                  path: '/work/alpha',
                },
                {
                  id: 'repo-beta',
                  name: 'Repo Beta',
                  rootPath: '/work/beta',
                  gitDir: '/work/beta/.git',
                  isBare: false,
                  currentBranch: 'dev',
                  path: '/work/beta',
                },
              ],
            },
          },
        }),
      );
    });

    const select = container.querySelector('[data-testid="repo-select"]') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.value).toBe('repo-alpha');

    // Change select value
    await act(async () => {
      select.value = 'repo-beta';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const selectMsg = postedMessages.find((m) => m.type === 'repository.select');
    expect(selectMsg).toBeDefined();
    expect((selectMsg?.payload as { repositoryId: string }).repositoryId).toBe('repo-beta');

    await act(async () => {
      root.unmount();
    });
  });
});
