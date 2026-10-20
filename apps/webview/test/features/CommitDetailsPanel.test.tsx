// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Commit } from '@git-graph/shared';
import { CommitDetailsPanel } from '../../src/features/details/CommitDetailsPanel';
import { useDetailsStore } from '../../src/stores/detailsStore';
import { useDiffStore } from '../../src/stores/diffStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { useSelectionStore } from '../../src/stores/selectionStore';

function createDummyCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
    shortSha: 'a1b2c3d',
    parents: ['b2c3d4e5f6a17890123456789abcdef012345678'],
    author: {
      name: 'Alice Developer',
      email: 'alice@example.com',
      timestamp: 1700000000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Bob Committer',
      email: 'bob@example.com',
      timestamp: 1700000010000,
      timezone: '+0000',
    },
    subject: 'feat: add details panel support',
    body: 'Extended commit body description with details.\nResolves #42',
    refs: [
      {
        name: 'main',
        fullName: 'refs/heads/main',
        target: 'a1b2c3d4e5f67890123456789abcdef012345678',
        kind: 'localBranch',
        isCurrent: true,
      },
      {
        name: 'v1.0.0',
        fullName: 'refs/tags/v1.0.0',
        target: 'a1b2c3d4e5f67890123456789abcdef012345678',
        kind: 'tag',
      },
    ],
    stats: {
      filesChanged: 3,
      additions: 45,
      deletions: 12,
    },
    ...overrides,
  };
}

describe('CommitDetailsPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useDetailsStore.getState().reset();
    useDiffStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useDetailsStore.getState().reset();
    useDiffStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('renders the uncommitted changes panel for the synthetic * row', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitDetailsPanel
          repositoryId="repo-1"
          selectedSha="*"
          onClose={vi.fn()}
          onStash={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-testid="uncommitted-changes-panel"]')).not.toBeNull();
    expect(useDetailsStore.getState().currentSha).not.toBe('*');

    await act(async () => root.unmount());
  });

  it('renders loading state when details are being fetched', async () => {
    useDetailsStore.setState({
      currentSha: 'a1b2c3d',
      currentRepositoryId: 'repo-1',
      isLoading: true,
      details: null,
      error: null,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha="a1b2c3d" onClose={vi.fn()} />,
      );
    });

    const loading = container.querySelector('[data-testid="commit-details-loading"]');
    expect(loading).toBeTruthy();
    expect(loading?.textContent).toContain('Loading commit details...');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders error state with retry button when fetching fails', async () => {
    const requestDetailsSpy = vi.spyOn(useDetailsStore.getState(), 'requestDetails');
    useDetailsStore.setState({
      currentSha: 'a1b2c3d',
      currentRepositoryId: 'repo-1',
      isLoading: false,
      details: null,
      error: 'Git fatal: object not found',
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha="a1b2c3d" onClose={vi.fn()} />,
      );
    });

    const err = container.querySelector('[data-testid="commit-details-error"]');
    expect(err).toBeTruthy();
    expect(err?.textContent).toContain('Git fatal: object not found');

    const retryBtn = container.querySelector(
      '[data-testid="details-retry-button"]',
    ) as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      retryBtn.click();
    });

    expect(requestDetailsSpy).toHaveBeenCalledWith('repo-1', 'a1b2c3d', undefined);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders complete commit details with metadata, refs, and stats', async () => {
    const commit = createDummyCommit();
    useDetailsStore.setState({
      currentSha: commit.sha,
      currentRepositoryId: 'repo-1',
      details: commit,
      isLoading: false,
      error: null,
    });

    const onClose = vi.fn();
    const onSelectCommit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel
          repositoryId="repo-1"
          selectedSha={commit.sha}
          onClose={onClose}
          onSelectCommit={onSelectCommit}
        />,
      );
    });

    // Subject
    const subject = container.querySelector('[data-testid="commit-details-subject"]');
    expect(subject?.textContent).toBe('feat: add details panel support');

    // Short SHA badge & full SHA
    expect(container.querySelector('[data-testid="details-short-sha"]')?.textContent).toBe(
      'a1b2c3d',
    );
    expect(container.querySelector('[data-testid="commit-details-full-sha"]')?.textContent).toBe(
      commit.sha,
    );

    // Author and Committer
    expect(container.querySelector('[data-testid="commit-details-author"]')?.textContent).toContain(
      'Alice Developer',
    );
    expect(
      container.querySelector('[data-testid="commit-details-committer"]')?.textContent,
    ).toContain('Bob Committer');

    // Ref Badges
    const refsSection = container.querySelector('[data-testid="commit-details-refs"]');
    expect(refsSection?.textContent).toContain('main');
    expect(refsSection?.textContent).toContain('v1.0.0');

    // Body
    expect(container.querySelector('[data-testid="commit-details-body"]')?.textContent).toContain(
      'Extended commit body description with details.',
    );

    // Stats
    const stats = container.querySelector('[data-testid="commit-details-stats"]');
    expect(stats?.textContent).toContain('3 files changed');
    expect(stats?.textContent).toContain('+45');
    expect(stats?.textContent).toContain('-12');

    // Parent link jump
    const parentBtn = container.querySelector(
      `[data-testid="parent-link-${commit.parents[0]!.slice(0, 7)}"]`,
    ) as HTMLButtonElement;
    expect(parentBtn).toBeTruthy();
    await act(async () => {
      parentBtn.click();
    });
    expect(onSelectCommit).toHaveBeenCalledWith(commit.parents[0]);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders merge commit with multiple selectable parents and triggers selectParent', async () => {
    const parent1 = '1111111111111111111111111111111111111111';
    const parent2 = '2222222222222222222222222222222222222222';
    const mergeCommit = createDummyCommit({
      parents: [parent1, parent2],
      subject: 'Merge branch feature into main',
    });

    const selectParentSpy = vi.fn();
    useDetailsStore.setState({
      currentSha: mergeCommit.sha,
      currentRepositoryId: 'repo-1',
      details: mergeCommit,
      selectedParentSha: parent1,
      isLoading: false,
      error: null,
      selectParent: selectParentSpy,
    });

    const onSelectCommit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel
          repositoryId="repo-1"
          selectedSha={mergeCommit.sha}
          onClose={vi.fn()}
          onSelectCommit={onSelectCommit}
        />,
      );
    });

    const mergeList = container.querySelector('[data-testid="merge-parents-list"]');
    expect(mergeList).toBeTruthy();

    const parent1Btn = container.querySelector(
      '[data-testid="parent-select-1"]',
    ) as HTMLButtonElement;
    const parent2Btn = container.querySelector(
      '[data-testid="parent-select-2"]',
    ) as HTMLButtonElement;

    expect(parent1Btn).toBeTruthy();
    expect(parent2Btn).toBeTruthy();
    expect(parent1Btn.classList.contains('active')).toBe(true);
    expect(parent2Btn.classList.contains('active')).toBe(false);

    // Switch to Parent 2
    await act(async () => {
      parent2Btn.click();
    });
    expect(selectParentSpy).toHaveBeenCalledWith(parent2);

    // Jump to parent 2 in graph
    const jump2Btn = container.querySelector('[data-testid="parent-jump-2"]') as HTMLButtonElement;
    await act(async () => {
      jump2Btn.click();
    });
    expect(onSelectCommit).toHaveBeenCalledWith(parent2);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders root commit indicator when parents array is empty', async () => {
    const rootCommit = createDummyCommit({
      parents: [],
      subject: 'Initial commit',
    });

    useDetailsStore.setState({
      currentSha: rootCommit.sha,
      currentRepositoryId: 'repo-1',
      details: rootCommit,
      isLoading: false,
      error: null,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha={rootCommit.sha} onClose={vi.fn()} />,
      );
    });

    const indicator = container.querySelector('[data-testid="root-commit-indicator"]');
    expect(indicator).toBeTruthy();
    expect(indicator?.textContent).toContain('initial / root commit');

    await act(async () => {
      root.unmount();
    });
  });

  it('calls onClose when close button is clicked or Escape is pressed', async () => {
    const commit = createDummyCommit();
    useDetailsStore.setState({
      currentSha: commit.sha,
      currentRepositoryId: 'repo-1',
      details: commit,
      isLoading: false,
    });

    const onClose = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha={commit.sha} onClose={onClose} />,
      );
    });

    const closeBtn = container.querySelector(
      '[data-testid="close-details-button"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it('copies commit SHA to clipboard when copy button is clicked', async () => {
    const commit = createDummyCommit();
    useDetailsStore.setState({
      currentSha: commit.sha,
      currentRepositoryId: 'repo-1',
      details: commit,
      isLoading: false,
    });

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextSpy,
      },
      configurable: true,
      writable: true,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha={commit.sha} onClose={vi.fn()} />,
      );
    });

    const copyBtn = container.querySelector('[data-testid="copy-sha-button"]') as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();

    await act(async () => {
      copyBtn.click();
    });

    expect(writeTextSpy).toHaveBeenCalledWith(commit.sha);
    expect(copyBtn.textContent).toContain('Copied');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders changed files list and selects file when clicked', async () => {
    const commit = createDummyCommit({
      fileChanges: [
        {
          path: 'src/index.ts',
          status: 'modified',
          additions: 12,
          deletions: 3,
          isBinary: false,
        },
      ],
    });

    useDetailsStore.setState({
      currentSha: commit.sha,
      currentRepositoryId: 'repo-1',
      details: commit,
      isLoading: false,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitDetailsPanel repositoryId="repo-1" selectedSha={commit.sha} onClose={vi.fn()} />,
      );
    });

    // Verify changed files container is present
    const changedFiles = container.querySelector('[data-testid="changed-files-container"]');
    expect(changedFiles).toBeTruthy();
    expect(
      container.querySelector('[data-testid="file-path-name-src/index.ts"]')?.textContent,
    ).toBe('src/index.ts');

    // Click file to select it
    const fileItem = container.querySelector(
      '[data-testid="changed-file-src/index.ts"]',
    ) as HTMLElement;
    await act(async () => {
      fileItem.click();
    });

    // Verify file is marked selected
    expect(useDiffStore.getState().selectedFilePath).toBe('src/index.ts');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders compare commits mode with commit range and diffstats when secondarySha is provided', async () => {
    const commitOlder = createDummyCommit({
      sha: '1111111111111111111111111111111111111111',
      shortSha: '1111111',
      subject: 'feat: base commit',
      author: {
        name: 'Alice',
        email: 'alice@example.com',
        timestamp: 1000,
        timezone: '+0000',
      },
    });
    const commitNewer = createDummyCommit({
      sha: '2222222222222222222222222222222222222222',
      shortSha: '2222222',
      subject: 'feat: target commit',
      author: {
        name: 'Bob',
        email: 'bob@example.com',
        timestamp: 2000,
        timezone: '+0000',
      },
    });

    // Populate graphStore so CommitDetailsPanel can determine older/newer
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [commitNewer, commitOlder], // index 0 is newest, index 1 is older
        hasMore: false,
      },
    });

    const compareDetails = createDummyCommit({
      sha: commitNewer.sha,
      shortSha: commitNewer.shortSha,
      subject: commitNewer.subject,
      stats: {
        filesChanged: 2,
        additions: 35,
        deletions: 10,
        commitCount: 4,
      },
      fileChanges: [
        {
          path: 'src/compare.ts',
          status: 'modified',
          additions: 35,
          deletions: 10,
          isBinary: false,
        },
      ],
    });

    useDetailsStore.setState({
      currentRepositoryId: 'repo-1',
      currentSha: commitNewer.sha,
      selectedParentSha: commitOlder.sha,
      details: compareDetails,
      isLoading: false,
      error: null,
    });

    const onSelectCommit = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitDetailsPanel
          repositoryId="repo-1"
          selectedSha={commitNewer.sha}
          secondarySha={commitOlder.sha}
          onClose={vi.fn()}
          onSelectCommit={onSelectCommit}
        />,
      );
    });

    // Verify Compare Commits Header
    const compareHeader = container.querySelector('[data-testid="compare-commits-header"]');
    expect(compareHeader).toBeTruthy();
    expect(compareHeader?.textContent).toContain('Compare Commits');

    // Verify Commit A (cũ hơn) and Commit B (mới hơn)
    const commitANode = container.querySelector('[data-testid="compare-commit-a"]');
    expect(commitANode).toBeTruthy();
    expect(commitANode?.textContent).toContain('Commit A (cũ hơn):');
    expect(commitANode?.textContent).toContain('1111111');

    const commitBNode = container.querySelector('[data-testid="compare-commit-b"]');
    expect(commitBNode).toBeTruthy();
    expect(commitBNode?.textContent).toContain('Commit B (mới hơn):');
    expect(commitBNode?.textContent).toContain('2222222');

    // Click on Commit A link button invokes onSelectCommit
    const btnA = container.querySelector(
      '[data-testid="compare-commit-a-btn"]',
    ) as HTMLButtonElement;
    expect(btnA).toBeTruthy();
    await act(async () => {
      btnA.click();
    });
    expect(onSelectCommit).toHaveBeenCalledWith(commitOlder.sha);

    // Verify stats
    const stats = container.querySelector('[data-testid="compare-commits-stats"]');
    expect(stats).toBeTruthy();
    expect(container.querySelector('[data-testid="compare-stat-commits"]')?.textContent).toContain(
      '4 commits (1111111..2222222)',
    );
    expect(container.querySelector('[data-testid="compare-stat-files"]')?.textContent).toContain(
      '2 files changed',
    );
    expect(container.querySelector('[data-testid="compare-stat-additions"]')?.textContent).toBe(
      '+35',
    );
    expect(container.querySelector('[data-testid="compare-stat-deletions"]')?.textContent).toBe(
      '-10',
    );

    // Click file to select it and verify DiffViewer is opened with comparison
    const fileItem = container.querySelector(
      '[data-testid="changed-file-src/compare.ts"]',
    ) as HTMLElement;
    expect(fileItem).toBeTruthy();
    await act(async () => {
      fileItem.click();
    });

    expect(container.querySelector('[data-testid="diff-viewer-panel"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});
