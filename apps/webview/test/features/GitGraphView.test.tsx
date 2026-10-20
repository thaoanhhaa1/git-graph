// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitGraphView } from '../../src/features/graph/GitGraphView';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { useSelectionStore } from '../../src/stores/selectionStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { Commit, GitRef, MessageEnvelope } from '@git-graph/shared';

describe('GitGraphView', () => {
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
    useSelectionStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('renders dedicated empty state when hasBootstrapped and no repositories', async () => {
    useRepositoryStore.getState().setRepositories([], undefined, true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const emptySection = container.querySelector('[data-testid="empty-repo-state"]');
    expect(emptySection).toBeTruthy();
    expect(container.querySelector('[data-testid="empty-state-title"]')?.textContent).toBe(
      'No Git Repositories Found',
    );

    const scanBtn = container.querySelector(
      '[data-testid="empty-state-refresh-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      scanBtn.click();
    });

    const listReq = postedMessages.find((m) => m.type === 'repositories.list.request');
    expect(listReq).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders error state with retry button when error occurs', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().setError('Git binary not found on PATH');

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const errorSection = container.querySelector('[data-testid="error-state"]');
    expect(errorSection).toBeTruthy();
    expect(errorSection?.getAttribute('role')).toBe('alert');
    expect(container.querySelector('[data-testid="error-state-message"]')?.textContent).toContain(
      'Git binary not found on PATH',
    );

    const retryBtn = container.querySelector('[data-testid="retry-btn"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      retryBtn.click();
    });

    // Error should be cleared and refresh dispatched
    expect(useGraphStore.getState().error).toBeNull();
    const refreshMsg = postedMessages.find((m) => m.type === 'graph.refresh.request');
    expect(refreshMsg).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders empty search state when no commits match search term', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().setSearchTerm('nonexistent-query-string-xyz');

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const emptySearch = container.querySelector('[data-testid="empty-search-state"]');
    expect(emptySearch).toBeTruthy();
    expect(emptySearch?.textContent).toContain('No commits found');
    expect(emptySearch?.textContent).toContain('nonexistent-query-string-xyz');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders commit rows and supports selection via click and keyboard', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);
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
        ],
        hasMore: false,
      },
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const commitRow = container.querySelector(
      '[data-testid="commit-row-a1b2c3d"]',
    ) as HTMLTableRowElement;
    expect(commitRow).toBeTruthy();

    // Click selects row
    await act(async () => {
      commitRow.click();
    });
    expect(useSelectionStore.getState().selectedCommitSha).toBe('a1b2c3d');
    expect(commitRow.classList.contains('selected')).toBe(true);

    // Keyboard selects next row
    const nextRow = container.querySelector(
      '[data-testid="commit-row-b2c3d4e"]',
    ) as HTMLTableRowElement;
    await act(async () => {
      nextRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(useSelectionStore.getState().selectedCommitSha).toBe('b2c3d4e');
    expect(nextRow.classList.contains('selected')).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('toggles detail panel open and closed when clicking the same commit row', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);
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
        ],
        hasMore: false,
      },
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const commitRow = container.querySelector(
      '[data-testid="commit-row-a1b2c3d"]',
    ) as HTMLTableRowElement;
    expect(commitRow).toBeTruthy();

    // First click: opens detail panel
    await act(async () => {
      commitRow.click();
    });
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(true);

    // Second click on same row: toggles detail panel closed
    await act(async () => {
      commitRow.click();
    });
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(false);

    // Third click on same row: re-opens detail panel
    await act(async () => {
      commitRow.click();
    });
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('GitGraphView dialogs', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[] = [];

  const commit = {
    sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    shortSha: 'a1b2c3d',
    parents: [] as string[],
    author: { name: 'Alice', email: 'alice@example.com', timestamp: 1000, timezone: '+0000' },
    committer: { name: 'Alice', email: 'alice@example.com', timestamp: 1000, timezone: '+0000' },
    subject: 'Commit 1',
    refs: [] as GitRef[],
  };

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];
    setVsCodeApi(
      createMockVsCodeApi(undefined, (msg) => {
        postedMessages.push(msg as MessageEnvelope);
      }),
    );
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  function seedCommit(overrides: Partial<Commit> = {}) {
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [{ ...commit, ...overrides }],
        hasMore: false,
      },
    });
  }

  async function openCommitMenu() {
    const row = container.querySelector(
      '[data-testid="commit-row-a1b2c3d"]',
    ) as HTMLTableRowElement;
    expect(row).toBeTruthy();
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(container.querySelector('[data-testid="commit-action-menu"]')).toBeTruthy();
  }

  async function clickMenuItem(id: string) {
    const item = container.querySelector(`[data-testid="action-menu-item-${id}"]`) as HTMLElement;
    expect(item).toBeTruthy();
    await act(async () => item.click());
  }

  it('opens the CreateTagDialog and submits a lightweight tag payload', async () => {
    seedCommit();
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('create-tag');

    expect(container.querySelector('[data-testid="create-tag-dialog"]')).toBeTruthy();

    const nameInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(nameInput, 'v1.0.0');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="create-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.tag.create.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      name: 'v1.0.0',
      target: commit.sha,
      tagType: 'lightweight',
    });
    expect(container.querySelector('[data-testid="create-tag-dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('opens MergeDialog and sends the selected options', async () => {
    seedCommit();
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('merge-commit');

    expect(container.querySelector('[data-testid="merge-dialog"]')).toBeTruthy();

    const ffOnly = container.querySelector(
      '[data-testid="merge-dialog-ff-only"]',
    ) as HTMLInputElement;
    await act(async () => ffOnly.click());

    const confirmBtn = container.querySelector(
      '[data-testid="merge-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.merge.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      target: commit.sha,
      fastForwardMode: 'ff-only',
      noConfirm: true,
    });

    await act(async () => root.unmount());
  });

  it('opens ResetDialog with the selected mode and requires hard reset confirmation', async () => {
    seedCommit();
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('reset-last-commit');

    expect(container.querySelector('[data-testid="reset-dialog"]')).toBeTruthy();
    const soft = container.querySelector(
      '[data-testid="reset-dialog-mode-soft"]',
    ) as HTMLInputElement;
    expect(soft.checked).toBe(true);

    const hard = container.querySelector(
      '[data-testid="reset-dialog-mode-hard"]',
    ) as HTMLInputElement;
    await act(async () => hard.click());

    const confirmBtn = container.querySelector(
      '[data-testid="reset-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const hardConfirm = container.querySelector(
      '[data-testid="reset-dialog-hard-confirm-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => hardConfirm.click());
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.reset.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      target: commit.sha,
      mode: 'hard',
      confirmedHardReset: true,
    });

    await act(async () => root.unmount());
  });

  it('opens CherryPickDialog and sends mainline parent for merge commits', async () => {
    const parent1 = '1111111111111111111111111111111111111111';
    const parent2 = '2222222222222222222222222222222222222222';
    seedCommit({ parents: [parent1, parent2] });
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('cherry-pick-commit');

    const select = container.querySelector(
      '[data-testid="cherry-pick-dialog-mainline-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.cherryPick.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      commit: commit.sha,
      mainlineParent: 2,
      noConfirm: true,
    });

    await act(async () => root.unmount());
  });

  it('opens RebaseDialog without published warning when no upstream is known', async () => {
    seedCommit();
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('rebase-commit');

    expect(container.querySelector('[data-testid="rebase-dialog"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="rebase-published-warning"]')).toBeNull();

    const ignoreDate = container.querySelector(
      '[data-testid="rebase-dialog-ignore-date-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => ignoreDate.click());

    const confirmBtn = container.querySelector(
      '[data-testid="rebase-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.rebase.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      target: commit.sha,
      ignoreDate: true,
      noConfirm: true,
    });

    await act(async () => root.unmount());
  });

  it('warns before rebasing a branch with an upstream', async () => {
    seedCommit({
      refs: [
        {
          name: 'main',
          fullName: 'refs/heads/main',
          target: commit.sha,
          kind: 'localBranch',
          isCurrent: true,
          upstream: 'origin/main',
        },
      ],
    });
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('rebase-commit');

    expect(container.querySelector('[data-testid="rebase-published-warning"]')).toBeTruthy();
    const confirmBtn = container.querySelector(
      '[data-testid="rebase-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const risk = container.querySelector(
      '[data-testid="rebase-dialog-risk-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => risk.click());
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.rebase.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      target: commit.sha,
      confirmedPublishedBranch: true,
      noConfirm: true,
    });

    await act(async () => root.unmount());
  });

  it('opens DeleteTagDialog from a tag badge and sends the delete request', async () => {
    seedCommit({
      refs: [
        {
          name: 'v1.0.0',
          fullName: 'refs/tags/v1.0.0',
          target: commit.sha,
          kind: 'tag',
          tagType: 'lightweight',
        },
      ],
    });
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    const tagBadge = container.querySelector('[data-testid="ref-badge-tag-v1.0.0"]') as HTMLElement;
    expect(tagBadge).toBeTruthy();
    await act(async () => {
      tagBadge.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await clickMenuItem('delete-tag-refs/tags/v1.0.0');

    expect(container.querySelector('[data-testid="delete-tag-dialog"]')).toBeTruthy();
    const confirmBtn = container.querySelector(
      '[data-testid="delete-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.tag.delete.request');
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      tagName: 'v1.0.0',
    });

    await act(async () => root.unmount());
  });

  it('opens RevertDialog and sends the revert request', async () => {
    seedCommit();
    const root = createRoot(container);
    await act(async () => root.render(<GitGraphView />));

    await openCommitMenu();
    await clickMenuItem('revert-commit');

    expect(container.querySelector('[data-testid="revert-dialog"]')).toBeTruthy();
    const confirmBtn = container.querySelector(
      '[data-testid="revert-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    const msg = postedMessages.find((m) => m.type === 'operation.revert.request');
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      commit: commit.sha,
      noConfirm: true,
    });

    await act(async () => root.unmount());
  });

  it('supports multi-selection via Ctrl/Cmd click and clears secondary selection on Escape or outside click', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([
        { id: 'repo-1', name: 'Repo One', path: '/path/one', currentBranch: 'main' },
      ]);
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
        ],
        hasMore: false,
      },
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const row1 = container.querySelector(
      '[data-testid="commit-row-a1b2c3d"]',
    ) as HTMLTableRowElement;
    const row2 = container.querySelector(
      '[data-testid="commit-row-b2c3d4e"]',
    ) as HTMLTableRowElement;
    expect(row1).toBeTruthy();
    expect(row2).toBeTruthy();

    // 1. Regular click on Commit 1 -> selectedCommitSha
    await act(async () => {
      row1.click();
    });
    expect(useSelectionStore.getState().selectedCommitSha).toBe('a1b2c3d');
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBeNull();
    expect(row1.classList.contains('selected')).toBe(true);

    // 2. Ctrl/Cmd click on Commit 2 -> secondarySelectedCommitSha
    await act(async () => {
      row2.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      );
    });
    expect(useSelectionStore.getState().selectedCommitSha).toBe('a1b2c3d');
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBe('b2c3d4e');
    expect(row1.classList.contains('selected')).toBe(true);
    expect(row2.classList.contains('secondary-selected')).toBe(true);

    // 3. Pressing Escape clears secondary selection
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBeNull();
    expect(useSelectionStore.getState().selectedCommitSha).toBe('a1b2c3d');
    expect(row2.classList.contains('secondary-selected')).toBe(false);

    // 4. Ctrl/Cmd click again to set secondary selection, then test outside click
    await act(async () => {
      row2.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
      );
    });
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBe('b2c3d4e');

    // Click outside commit rows and details panel
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
