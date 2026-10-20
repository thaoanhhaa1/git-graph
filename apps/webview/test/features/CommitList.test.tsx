// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommitList, COMPACT_ROW_HEIGHT } from '../../src/features/graph/CommitList';
import type { CommitItem } from '../../src/features/graph/CommitRow';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';

function createMockCommits(count: number, prefix = 'commit'): CommitItem[] {
  return Array.from({ length: count }, (_, i) => ({
    hash: `${prefix}-hash-${i.toString().padStart(4, '0')}`,
    shortHash: `${prefix.slice(0, 3)}${i}`,
    message: `Message for ${prefix} ${i}`,
    author: `Author ${i % 3}`,
    date: '2026-09-18',
  }));
}

describe('CommitList', () => {
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

  it('virtualizes commit list and renders only viewport + overscan rows', async () => {
    const commits = createMockCommits(100);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={30}
          overscan={3}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;
    expect(tableContainer).toBeTruthy();

    // In happy-dom fallback viewport height is 600px -> 600/30 = 20 rows visible + 3 overscan = 23 rows
    const rows = container.querySelectorAll('.commit-row');
    expect(rows.length).toBeLessThan(100);
    expect(rows.length).toBeGreaterThan(0);

    // Bottom spacer should be present to account for unrendered rows
    const bottomSpacer = container.querySelector(
      '[data-testid="commit-spacer-bottom"]',
    ) as HTMLTableRowElement;
    expect(bottomSpacer).toBeTruthy();
    expect(bottomSpacer.style.height).toBeTruthy();

    // Top spacer should not be present initially when scrolled at top
    const topSpacer = container.querySelector('[data-testid="commit-spacer-top"]');
    expect(topSpacer).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('updates visible rows and top spacer on scroll', async () => {
    const commits = createMockCommits(100);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={30}
          overscan={2}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    // Simulate scrolling down to 900px
    await act(async () => {
      tableContainer.scrollTop = 900;
      tableContainer.dispatchEvent(new Event('scroll'));
    });

    // Top spacer should now be rendered
    const topSpacer = container.querySelector(
      '[data-testid="commit-spacer-top"]',
    ) as HTMLTableRowElement;
    expect(topSpacer).toBeTruthy();

    // 900 / 30 = row 30; with overscan 2, startIndex = 28 -> top spacer height = 28 * 30 = 840px
    expect(topSpacer.style.height).toBe('840px');

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onLoadMore when scrolling near the bottom of the list', async () => {
    const commits = createMockCommits(50);
    const onLoadMore = vi.fn();
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          hasMore={true}
          isLoadingMore={false}
          onLoadMore={onLoadMore}
          rowHeight={28}
          loadMoreThreshold={5}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    // Mock scrollHeight and clientHeight
    Object.defineProperty(tableContainer, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(tableContainer, 'scrollHeight', { value: 1400, configurable: true });

    // Scroll near the bottom: scrollBottom = 1400 - (850 + 500) = 50px <= threshold (5 * 28 = 140px)
    await act(async () => {
      tableContainer.scrollTop = 850;
      tableContainer.dispatchEvent(new Event('scroll'));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('does not trigger onLoadMore when isLoadingMore is true or hasMore is false', async () => {
    const commits = createMockCommits(50);
    const onLoadMore = vi.fn();
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          hasMore={true}
          isLoadingMore={true} // already loading
          onLoadMore={onLoadMore}
          rowHeight={28}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    Object.defineProperty(tableContainer, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(tableContainer, 'scrollHeight', { value: 1400, configurable: true });

    await act(async () => {
      tableContainer.scrollTop = 890;
      tableContainer.dispatchEvent(new Event('scroll'));
    });

    expect(onLoadMore).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders loading row when isLoadingMore is true', async () => {
    const commits = createMockCommits(10);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          isLoadingMore={true}
        />,
      );
    });

    const loadingRow = container.querySelector('[data-testid="commit-loading-row"]');
    expect(loadingRow).toBeTruthy();
    expect(loadingRow?.textContent).toContain('Loading more commits...');

    await act(async () => {
      root.unmount();
    });
  });

  it('resets scroll position to 0 when repositoryId changes', async () => {
    const commits = createMockCommits(50);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={28}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    await act(async () => {
      tableContainer.scrollTop = 400;
      tableContainer.dispatchEvent(new Event('scroll'));
    });
    expect(tableContainer.scrollTop).toBe(400);

    // Switch repositoryId to repo-2
    await act(async () => {
      root.render(
        <CommitList
          commits={createMockCommits(50, 'repo2')}
          repositoryId="repo-2"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={28}
        />,
      );
    });

    expect(tableContainer.scrollTop).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('preserves scroll position when new commits are appended', async () => {
    const initialCommits = createMockCommits(30);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={initialCommits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={28}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    await act(async () => {
      tableContainer.scrollTop = 280;
      tableContainer.dispatchEvent(new Event('scroll'));
    });
    expect(tableContainer.scrollTop).toBe(280);

    // Append 30 more commits with same prefix/first commit
    const appendedCommits = [...initialCommits, ...createMockCommits(30, 'appended')];
    await act(async () => {
      root.render(
        <CommitList
          commits={appendedCommits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
          rowHeight={28}
        />,
      );
    });

    // Scroll position should still be 280
    expect(tableContainer.scrollTop).toBe(280);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders skeleton rows when commits is empty and not bootstrapped yet', async () => {
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={[]}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
        />,
      );
    });

    const skeletonRows = container.querySelectorAll('[data-testid="commit-skeleton-row"]');
    expect(skeletonRows.length).toBe(8);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders empty message row when repository has bootstrapped and has no commits', async () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }], undefined, true);
    useGraphStore.setState({ isLoading: false });
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={[]}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={onSelect}
        />,
      );
    });

    const emptyRow = container.querySelector('[data-testid="commit-empty-row"]');
    expect(emptyRow).toBeTruthy();
    expect(emptyRow?.textContent).toContain('No commits found in this repository.');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders graph continuation lines in inline details row when detail panel is open', async () => {
    const mockCommitObj = {
      sha: 'commit-hash-0001',
      shortSha: 'c001',
      parents: [],
      author: { name: 'Author 1', email: 'author1@test.com', timestamp: 1000, timezone: '+0000' },
      committer: {
        name: 'Author 1',
        email: 'author1@test.com',
        timestamp: 1000,
        timezone: '+0000',
      },
      subject: 'First commit',
      body: '',
      refs: [],
    };
    const commits: CommitItem[] = [
      {
        hash: 'commit-hash-0001',
        shortHash: 'c001',
        message: 'First commit',
        author: 'Author 1',
        date: '2026-09-18',
        graphRow: {
          commit: mockCommitObj,
          row: 0,
          lane: 0,
          segments: [
            { kind: 'straight', fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, colorIndex: 0 },
            { kind: 'pass-through', fromRow: 0, fromLane: 1, toRow: 1, toLane: 1, colorIndex: 1 },
          ],
          maxLane: 1,
        },
      },
    ];
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c001"
          isDetailPanelOpen={true}
          onSelectCommit={onSelect}
        />,
      );
    });

    const detailsRow = container.querySelector('[data-testid="commit-details-inline-row"]');
    expect(detailsRow).toBeTruthy();

    const graphCell = detailsRow?.querySelector('.commit-details-graph-cell');
    expect(graphCell).toBeTruthy();

    const continuationSvg = graphCell?.querySelector('.graph-details-continuation-svg');
    expect(continuationSvg).toBeTruthy();

    const lines = continuationSvg?.querySelectorAll('line');
    expect(lines?.length).toBe(2);

    const detailCell = detailsRow?.querySelector(
      '.commit-details-inline-cell',
    ) as HTMLTableCellElement;
    expect(detailCell).toBeTruthy();
    expect(detailCell.colSpan).toBe(4); // totalColumns (5) - 1 = 4

    await act(async () => {
      root.unmount();
    });
  });

  it('handles keyboard navigation with ArrowUp/ArrowDown, Enter, Space, Escape, and Ctrl+F', async () => {
    const commits = createMockCommits(5);
    const onSelect = vi.fn();
    const onOpenDetail = vi.fn();
    const onCloseDetail = vi.fn();

    // Create a mock search input in document
    const searchInput = document.createElement('input');
    searchInput.id = 'search-input';
    document.body.appendChild(searchInput);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="com0"
          isDetailPanelOpen={false}
          onSelectCommit={onSelect}
          onOpenDetail={onOpenDetail}
          onCloseDetail={onCloseDetail}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;
    expect(tableContainer).toBeTruthy();

    // ArrowDown navigates to next commit
    await act(async () => {
      tableContainer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledWith('com1');

    // Re-render with com1 selected to test ArrowUp
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="com1"
          isDetailPanelOpen={false}
          onSelectCommit={onSelect}
          onOpenDetail={onOpenDetail}
          onCloseDetail={onCloseDetail}
        />,
      );
    });

    // ArrowUp navigates back
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('com0');

    // Enter opens details panel when closed
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onOpenDetail).toHaveBeenCalledWith('com1');

    // Re-render with isDetailPanelOpen=true to test toggling close on Enter
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="com1"
          isDetailPanelOpen={true}
          onSelectCommit={onSelect}
          onOpenDetail={onOpenDetail}
          onCloseDetail={onCloseDetail}
        />,
      );
    });

    // Enter now toggles details closed
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCloseDetail).toHaveBeenCalledTimes(1);

    // Escape closes details panel
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCloseDetail).toHaveBeenCalledTimes(2);

    // Space on focused commit triggers detail/diff
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onOpenDetail).toHaveBeenCalledWith('com1');

    // Ctrl+F focuses search input
    const focusSpy = vi.spyOn(searchInput, 'focus');
    await act(async () => {
      tableContainer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }),
      );
    });
    expect(focusSpy).toHaveBeenCalled();

    searchInput.remove();
    await act(async () => {
      root.unmount();
    });
  });

  it('supports drag-and-drop column resizing and persists widths', async () => {
    const mockApi = createMockVsCodeApi({ columnWidths: {} });
    const setStateSpy = vi.spyOn(mockApi, 'setState');
    setVsCodeApi(mockApi);

    const commits = createMockCommits(3);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={vi.fn()}
        />,
      );
    });

    const dateHandle = container.querySelector(
      '[data-testid="resize-handle-date"]',
    ) as HTMLDivElement;
    expect(dateHandle).toBeTruthy();

    // Trigger drag resize on date column
    await act(async () => {
      dateHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, bubbles: true }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, bubbles: true }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(setStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        columnWidths: expect.objectContaining({
          date: expect.any(Number),
        }),
      }),
    );

    resetVsCodeApi();
    await act(async () => {
      root.unmount();
    });
  });

  it('exports COMPACT_ROW_HEIGHT = 18 and applies compact row height', async () => {
    expect(COMPACT_ROW_HEIGHT).toBe(18);

    const commits = createMockCommits(2);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={vi.fn()}
          rowHeight={COMPACT_ROW_HEIGHT}
        />,
      );
    });

    const firstRow = container.querySelector(
      '[data-testid="commit-row-com0"]',
    ) as HTMLTableRowElement;
    expect(firstRow).toBeTruthy();
    expect(firstRow.style.height).toBe('18px');

    await act(async () => {
      root.unmount();
    });
  });
});
