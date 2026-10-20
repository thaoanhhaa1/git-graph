// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WorktreeStatus, MessageEnvelope } from '@git-graph/shared';
import { GitGraphView } from '../../src/features/graph/GitGraphView';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { useSelectionStore } from '../../src/stores/selectionStore';
import { useWorktreeStore } from '../../src/stores/worktreeStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';

function createMockWorktreeStatus(overrides: Partial<WorktreeStatus> = {}): WorktreeStatus {
  return {
    isClean: false,
    staged: [
      {
        path: 'src/staged.ts',
        status: 'modified',
        indexStatus: 'M',
        worktreeStatus: ' ',
        staged: true,
        unstaged: false,
      },
    ],
    unstaged: [
      {
        path: 'src/unstaged.ts',
        status: 'modified',
        indexStatus: ' ',
        worktreeStatus: 'M',
        staged: false,
        unstaged: true,
      },
      {
        path: 'docs/new-file.md',
        status: 'untracked',
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
      },
    ],
    hasConflicts: false,
    head: {
      sha: '1111111111111111111111111111111111111111',
      subject: 'chore: previous head commit',
      body: 'Previous commit description body',
    },
    currentBranch: 'main',
    ...overrides,
  };
}

describe('Uncommitted changes staging/unstaging/commit workflow', () => {
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
    useWorktreeStore.getState().reset();

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
    useWorktreeStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('selects uncommitted changes row, renders panel, and performs full stage/unstage/commit cycle', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }], 'repo-1', true);

    // Initial commit list including the uncommitted changes row "*"
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [
          {
            sha: '*',
            shortSha: '*',
            parents: ['1111111111111111111111111111111111111111'],
            author: { name: '*', email: '*', timestamp: Date.now(), timezone: '+0000' },
            committer: { name: '*', email: '*', timestamp: Date.now(), timezone: '+0000' },
            subject: 'Uncommitted Changes',
            refs: [],
          },
          {
            sha: '1111111111111111111111111111111111111111',
            shortSha: '1111111',
            parents: [],
            author: { name: 'Alice', email: 'alice@test.com', timestamp: 1000, timezone: '+0000' },
            committer: {
              name: 'Alice',
              email: 'alice@test.com',
              timestamp: 1000,
              timezone: '+0000',
            },
            subject: 'chore: previous head commit',
            refs: [
              {
                name: 'main',
                fullName: 'refs/heads/main',
                kind: 'localBranch',
                target: '1111111111111111111111111111111111111111',
              },
            ],
          },
        ],
        hasMore: false,
      },
    });

    useWorktreeStore.getState().receiveStatus('repo-1', createMockWorktreeStatus());

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    // Verify uncommitted row is rendered in the list
    const uncommittedRow = container.querySelector(
      '[data-testid="commit-row-*"]',
    ) as HTMLTableRowElement;
    expect(uncommittedRow).toBeTruthy();

    // Click uncommitted row to open details
    await act(async () => {
      uncommittedRow.click();
    });

    // UncommittedChangesPanel should be displayed
    const worktreePanel = container.querySelector('[data-testid="uncommitted-changes-panel"]');
    expect(worktreePanel).toBeTruthy();

    // Stage individual unstaged file
    const stageBtn = container.querySelector(
      '[data-testid="worktree-stage-src/unstaged.ts"]',
    ) as HTMLElement;
    expect(stageBtn).toBeTruthy();
    await act(async () => {
      stageBtn.click();
    });

    const stageMsg = postedMessages.find((m) => m.type === 'worktree.stage.request');
    expect(stageMsg).toBeDefined();
    expect(stageMsg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      paths: ['src/unstaged.ts'],
    });

    // Unstage individual staged file
    const unstageBtn = container.querySelector(
      '[data-testid="worktree-unstage-src/staged.ts"]',
    ) as HTMLElement;
    expect(unstageBtn).toBeTruthy();
    await act(async () => {
      unstageBtn.click();
    });

    const unstageMsg = postedMessages.find((m) => m.type === 'worktree.unstage.request');
    expect(unstageMsg).toBeDefined();
    expect(unstageMsg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      paths: ['src/staged.ts'],
    });

    // Type commit summary and description
    const summaryInput = container.querySelector(
      '[data-testid="uncommitted-commit-summary"]',
    ) as HTMLInputElement;
    const descInput = container.querySelector(
      '[data-testid="uncommitted-commit-description"]',
    ) as HTMLTextAreaElement;
    expect(summaryInput).toBeTruthy();
    expect(descInput).toBeTruthy();

    await act(async () => {
      const proto = Object.getPrototypeOf(summaryInput);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(summaryInput, 'feat: stage and commit workflow');
      summaryInput.dispatchEvent(new Event('input', { bubbles: true }));

      const descProto = Object.getPrototypeOf(descInput);
      const descSetter = Object.getOwnPropertyDescriptor(descProto, 'value')?.set;
      descSetter?.call(descInput, 'Commit body from workflow test');
      descInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Commit button click
    const commitBtn = container.querySelector(
      '[data-testid="uncommitted-commit-btn"]',
    ) as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(false);

    await act(async () => {
      commitBtn.click();
    });

    const commitMsg = postedMessages.find((m) => m.type === 'operation.commit.create.request');
    expect(commitMsg).toBeDefined();
    expect(commitMsg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      message: 'feat: stage and commit workflow',
      description: 'Commit body from workflow test',
    });

    await act(async () => root.unmount());
  });

  it('handles amend workflow by populating previous HEAD message', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }], 'repo-1', true);

    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [
          {
            sha: '*',
            shortSha: '*',
            parents: ['1111111111111111111111111111111111111111'],
            author: { name: '*', email: '*', timestamp: Date.now(), timezone: '+0000' },
            committer: { name: '*', email: '*', timestamp: Date.now(), timezone: '+0000' },
            subject: 'Uncommitted Changes',
            refs: [],
          },
        ],
        hasMore: false,
      },
    });

    useSelectionStore.getState().selectCommit('*');
    useSelectionStore.getState().setDetailPanelOpen(true);
    useWorktreeStore.getState().receiveStatus('repo-1', createMockWorktreeStatus());

    const root = createRoot(container);
    await act(async () => {
      root.render(<GitGraphView />);
    });

    const amendCheckbox = container.querySelector(
      '[data-testid="uncommitted-amend-checkbox"]',
    ) as HTMLInputElement;
    expect(amendCheckbox).toBeTruthy();

    await act(async () => {
      amendCheckbox.click();
    });

    const summaryInput = container.querySelector(
      '[data-testid="uncommitted-commit-summary"]',
    ) as HTMLInputElement;
    const descInput = container.querySelector(
      '[data-testid="uncommitted-commit-description"]',
    ) as HTMLTextAreaElement;

    expect(summaryInput.value).toBe('chore: previous head commit');
    expect(descInput.value).toBe('Previous commit description body');

    const commitBtn = container.querySelector(
      '[data-testid="uncommitted-commit-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      commitBtn.click();
    });

    const amendCommitMsg = postedMessages.find((m) => m.type === 'operation.commit.create.request');
    expect(amendCommitMsg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      message: 'chore: previous head commit',
      description: 'Previous commit description body',
      amend: true,
    });

    await act(async () => root.unmount());
  });
});
