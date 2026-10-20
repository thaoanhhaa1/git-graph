// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WorktreeStatus } from '@git-graph/shared';
import { UncommittedChangesPanel } from '../../src/features/details/UncommittedChangesPanel';
import { useWorktreeStore } from '../../src/stores/worktreeStore';
import * as messageRouter from '../../src/messaging/messageRouter';

function createStatus(overrides: Partial<WorktreeStatus> = {}): WorktreeStatus {
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
        path: 'new-file.ts',
        status: 'untracked',
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
      },
    ],
    hasConflicts: false,
    head: { sha: 'a'.repeat(40), subject: 'feat: previous commit', body: 'Previous body' },
    currentBranch: 'main',
    ...overrides,
  };
}

function click(el: Element | null) {
  if (!el) {
    throw new Error('Element not found');
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) {
    throw new Error('Input not found');
  }
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('UncommittedChangesPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useWorktreeStore.getState().reset();
    vi.restoreAllMocks();
    vi.spyOn(messageRouter, 'requestWorktreeStatus').mockReturnValue('request-1');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPanel(onClose = vi.fn(), onStash?: () => void) {
    await act(async () => {
      root.render(
        <UncommittedChangesPanel repositoryId="repo-1" onClose={onClose} onStash={onStash} />,
      );
    });
  }

  it('renders staged and unstaged sections with counts', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    await renderPanel();

    expect(container.querySelector('[data-testid="uncommitted-changes-panel"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="worktree-staged-section-count"]')?.textContent,
    ).toBe('1');
    expect(
      container.querySelector('[data-testid="worktree-unstaged-section-count"]')?.textContent,
    ).toBe('2');
    expect(container.textContent).toContain('on main');
    expect(
      container.querySelector('[data-testid="worktree-file-unstaged-new-file.ts"]'),
    ).not.toBeNull();
  });

  it('requests status on mount and shows a clean worktree message', async () => {
    useWorktreeStore
      .getState()
      .receiveStatus('repo-1', createStatus({ isClean: true, staged: [], unstaged: [] }));
    await renderPanel();

    expect(messageRouter.requestWorktreeStatus).toHaveBeenCalledWith('repo-1');
    expect(container.querySelector('[data-testid="uncommitted-clean"]')).not.toBeNull();
  });

  it('stages, unstages, and discards individual files', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    const stageSpy = vi.spyOn(messageRouter, 'requestStageWorktree').mockReturnValue('s');
    const unstageSpy = vi.spyOn(messageRouter, 'requestUnstageWorktree').mockReturnValue('u');
    const discardSpy = vi.spyOn(messageRouter, 'requestDiscardWorktree').mockReturnValue('d');
    await renderPanel();

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-stage-src/unstaged.ts"]'));
    });
    expect(stageSpy).toHaveBeenCalledWith({ repositoryId: 'repo-1', paths: ['src/unstaged.ts'] });

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-unstage-src/staged.ts"]'));
    });
    expect(unstageSpy).toHaveBeenCalledWith({ repositoryId: 'repo-1', paths: ['src/staged.ts'] });

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-discard-src/unstaged.ts"]'));
    });
    expect(container.querySelector('[data-testid="discard-dialog"]')?.textContent).toContain(
      'src/unstaged.ts',
    );

    await act(async () => {
      click(container.querySelector('[data-testid="discard-dialog-confirm-btn"]'));
    });
    expect(discardSpy).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      paths: ['src/unstaged.ts'],
      all: false,
      untracked: true,
      noConfirm: true,
    });
    expect(container.querySelector('[data-testid="discard-dialog"]')).toBeNull();
  });

  it('stages, unstages, and discards all changes', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    const stageSpy = vi.spyOn(messageRouter, 'requestStageWorktree').mockReturnValue('s');
    const unstageSpy = vi.spyOn(messageRouter, 'requestUnstageWorktree').mockReturnValue('u');
    const discardSpy = vi.spyOn(messageRouter, 'requestDiscardWorktree').mockReturnValue('d');
    await renderPanel();

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-stage-all-btn"]'));
    });
    expect(stageSpy).toHaveBeenCalledWith({ repositoryId: 'repo-1', paths: [], all: true });

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-unstage-all-btn"]'));
    });
    expect(unstageSpy).toHaveBeenCalledWith({ repositoryId: 'repo-1', paths: [], all: true });

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-discard-all-btn"]'));
    });
    expect(container.querySelector('[data-testid="discard-dialog"]')?.textContent).toContain(
      'all staged and unstaged changes',
    );

    await act(async () => {
      click(container.querySelector('[data-testid="discard-dialog-confirm-btn"]'));
    });
    expect(discardSpy).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      paths: [],
      all: true,
      untracked: true,
      noConfirm: true,
    });
  });

  it('creates a commit from the summary and description', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    const commitSpy = vi.spyOn(messageRouter, 'requestCreateCommit').mockReturnValue('c');
    await renderPanel();

    const summary = container.querySelector(
      '[data-testid="uncommitted-commit-summary"]',
    ) as HTMLInputElement;
    const description = container.querySelector(
      '[data-testid="uncommitted-commit-description"]',
    ) as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(summary, 'feat: new worktree panel');
      setInputValue(description, 'Body text');
    });

    await act(async () => {
      click(container.querySelector('[data-testid="uncommitted-commit-btn"]'));
    });

    expect(commitSpy).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      message: 'feat: new worktree panel',
      description: 'Body text',
    });
  });

  it('prefills the amend form with the previous commit and disables commit when clean', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus({ staged: [], unstaged: [] }));
    const commitSpy = vi.spyOn(messageRouter, 'requestCreateCommit').mockReturnValue('c');
    await renderPanel();

    const commitBtn = container.querySelector(
      '[data-testid="uncommitted-commit-btn"]',
    ) as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(true);

    const amend = container.querySelector(
      '[data-testid="uncommitted-amend-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => {
      amend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      (container.querySelector('[data-testid="uncommitted-commit-summary"]') as HTMLInputElement)
        .value,
    ).toBe('feat: previous commit');
    expect(
      (
        container.querySelector(
          '[data-testid="uncommitted-commit-description"]',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Previous body');

    await act(async () => {
      click(container.querySelector('[data-testid="uncommitted-commit-btn"]'));
    });

    expect(commitSpy).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      message: 'feat: previous commit',
      description: 'Previous body',
      amend: true,
    });
  });

  it('opens the diff for a file with the staged flag', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    const diffSpy = vi.spyOn(messageRouter, 'openDiffInVsCode').mockImplementation(() => {});
    await renderPanel();

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-open-diff-src/staged.ts"]'));
    });

    expect(diffSpy).toHaveBeenCalledWith(
      'repo-1',
      '*',
      'src/staged.ts',
      undefined,
      undefined,
      true,
    );
  });

  it('calls onStash and onClose from the header actions', async () => {
    useWorktreeStore.getState().receiveStatus('repo-1', createStatus());
    const onClose = vi.fn();
    const onStash = vi.fn();
    await renderPanel(onClose, onStash);

    await act(async () => {
      click(container.querySelector('[data-testid="worktree-stash-btn"]'));
    });
    expect(onStash).toHaveBeenCalledTimes(1);

    await act(async () => {
      click(container.querySelector('[data-testid="close-uncommitted-button"]'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks commit when there are conflicts', async () => {
    useWorktreeStore.getState().receiveStatus(
      'repo-1',
      createStatus({
        hasConflicts: true,
        unstaged: [
          {
            path: 'conflict.ts',
            status: 'unmerged',
            indexStatus: 'U',
            worktreeStatus: 'U',
            staged: false,
            unstaged: true,
          },
        ],
      }),
    );
    await renderPanel();

    const summary = container.querySelector(
      '[data-testid="uncommitted-commit-summary"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(summary, 'feat: conflict');
    });

    const commitBtn = container.querySelector(
      '[data-testid="uncommitted-commit-btn"]',
    ) as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(true);
  });
});
