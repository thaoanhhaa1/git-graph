// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CompareBranchDialog,
  findCommitShaForBranch,
} from '../../src/features/dialogs/CompareBranchDialog';
import { useGraphStore } from '../../src/stores/graphStore';
import type { Commit } from '@git-graph/shared';

describe('CompareBranchDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders correctly with source branch in title and excludes source branch from options', async () => {
    const commits: Commit[] = [
      {
        sha: 'sha-prod-1234567890',
        shortSha: 'sha-prod',
        parents: [],
        author: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        committer: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        subject: 'production commit',
        refs: [
          {
            name: 'Production',
            fullName: 'refs/heads/Production',
            kind: 'localBranch',
            target: 'sha-prod-1234567890',
          },
        ],
      },
      {
        sha: 'sha-dev-1234567890',
        shortSha: 'sha-dev',
        parents: [],
        author: { name: 'Dev', email: 'dev@test.com', timestamp: 900, timezone: '+0000' },
        committer: { name: 'Dev', email: 'dev@test.com', timestamp: 900, timezone: '+0000' },
        subject: 'development commit',
        refs: [
          {
            name: 'Development',
            fullName: 'refs/heads/Development',
            kind: 'localBranch',
            target: 'sha-dev-1234567890',
          },
        ],
      },
    ];

    useGraphStore.setState({ commits, activeRepoId: 'repo-1' });

    const onClose = vi.fn();
    const onCompare = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CompareBranchDialog
          sourceBranch="Production"
          isOpen={true}
          onClose={onClose}
          onCompare={onCompare}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="compare-branch-dialog"]');
    expect(dialog).toBeTruthy();

    const title = container.querySelector(
      '[data-testid="compare-branch-dialog"] .compare-branch-title',
    );
    expect(title?.textContent).toBe('Select branch to compare Production with:');

    const select = container.querySelector(
      '[data-testid="compare-branch-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();

    const optionValues = Array.from(select.options).map((opt) => opt.value);
    expect(optionValues).toContain('Development');
    expect(optionValues).not.toContain('Production');

    // Click Compare
    const confirmBtn = container.querySelector(
      '[data-testid="compare-branch-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.textContent).toBe('Compare');

    await act(async () => {
      confirmBtn.click();
    });

    expect(onCompare).toHaveBeenCalledWith('Production', 'Development', 'sha-dev-1234567890');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('closes dialog on cancel button click', async () => {
    const onClose = vi.fn();
    const onCompare = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CompareBranchDialog
          sourceBranch="Production"
          isOpen={true}
          onClose={onClose}
          onCompare={onCompare}
        />,
      );
    });

    const cancelBtn = container.querySelector(
      '[data-testid="compare-branch-cancel-btn"]',
    ) as HTMLButtonElement;
    expect(cancelBtn.textContent).toBe('Cancel');

    await act(async () => {
      cancelBtn.click();
    });

    expect(onClose).toHaveBeenCalled();
    expect(onCompare).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('does not render when isOpen is false', async () => {
    const onClose = vi.fn();
    const onCompare = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CompareBranchDialog
          sourceBranch="Production"
          isOpen={false}
          onClose={onClose}
          onCompare={onCompare}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="compare-branch-dialog"]');
    expect(dialog).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('correctly resolves commit SHA using findCommitShaForBranch', () => {
    const commits: Commit[] = [
      {
        sha: 'abc123456789',
        shortSha: 'abc1234',
        parents: [],
        author: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        committer: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        subject: 'c1',
        refs: [
          {
            name: 'main',
            fullName: 'refs/heads/main',
            kind: 'localBranch',
            target: 'abc123456789',
          },
        ],
      },
    ];

    expect(findCommitShaForBranch('main', commits)).toBe('abc123456789');
    expect(findCommitShaForBranch('refs/heads/main', commits)).toBe('abc123456789');
    expect(findCommitShaForBranch('non-existent', commits)).toBeUndefined();
  });
});
