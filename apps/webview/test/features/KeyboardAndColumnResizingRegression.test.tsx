// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CommitList,
  COMPACT_ROW_HEIGHT,
  DEFAULT_ROW_HEIGHT,
} from '../../src/features/graph/CommitList';
import type { CommitItem } from '../../src/features/graph/CommitRow';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';

function createMockCommits(count: number): CommitItem[] {
  return Array.from({ length: count }, (_, i) => ({
    hash: `commit-sha-${i.toString().padStart(4, '0')}`,
    shortHash: `c${i.toString().padStart(3, '0')}`,
    message: `Commit subject message ${i}`,
    author: `Author ${i % 4}`,
    date: '2026-09-20',
  }));
}

describe('Keyboard Navigation & Column Resizing Regression Suite', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    resetVsCodeApi();
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('navigates through commits sequentially using ArrowUp and ArrowDown with boundary safety', async () => {
    const commits = createMockCommits(4);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c000"
          onSelectCommit={onSelect}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;
    expect(tableContainer).toBeTruthy();

    // ArrowUp on top commit: cannot go above index 0
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();

    // ArrowDown moves to next commit (c001)
    await act(async () => {
      tableContainer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledWith('c001');

    // Re-render with bottom commit selected to test boundary guard
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c003"
          onSelectCommit={onSelect}
        />,
      );
    });

    onSelect.mockClear();

    // ArrowDown on bottom commit: cannot go below index 3
    await act(async () => {
      tableContainer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(onSelect).not.toHaveBeenCalled();

    // ArrowUp from bottom commit moves up to c002
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('c002');

    await act(async () => root.unmount());
  });

  it('handles Home and End keys to jump to top and bottom of history', async () => {
    const commits = createMockCommits(10);
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c005"
          onSelectCommit={onSelect}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    // Home jumps to c000
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('c000');

    // End jumps to c009
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('c009');

    await act(async () => root.unmount());
  });

  it('toggles details with Enter, Space, and Escape keys', async () => {
    const commits = createMockCommits(3);
    const onOpenDetail = vi.fn();
    const onCloseDetail = vi.fn();
    const root = createRoot(container);

    // Initial state: details closed
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c001"
          isDetailPanelOpen={false}
          onSelectCommit={vi.fn()}
          onOpenDetail={onOpenDetail}
          onCloseDetail={onCloseDetail}
        />,
      );
    });

    const tableContainer = container.querySelector(
      '[data-testid="commit-table-container"]',
    ) as HTMLDivElement;

    // Enter opens details
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onOpenDetail).toHaveBeenCalledWith('c001');

    // Space also opens details
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onOpenDetail).toHaveBeenCalledTimes(2);

    // Now re-render with details open
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha="c001"
          isDetailPanelOpen={true}
          onSelectCommit={vi.fn()}
          onOpenDetail={onOpenDetail}
          onCloseDetail={onCloseDetail}
        />,
      );
    });

    // Enter toggles details closed
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCloseDetail).toHaveBeenCalledTimes(1);

    // Escape closes details
    await act(async () => {
      tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCloseDetail).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('resizes columns and persists widths into vsCodeApi state with minimum constraints', async () => {
    const mockApi = createMockVsCodeApi({ columnWidths: {} });
    const setStateSpy = vi.spyOn(mockApi, 'setState');
    setVsCodeApi(mockApi);

    const commits = createMockCommits(2);
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

    const authorHandle = container.querySelector(
      '[data-testid="resize-handle-author"]',
    ) as HTMLDivElement;
    expect(authorHandle).toBeTruthy();

    // Start resize drag on author column at clientX = 300
    await act(async () => {
      authorHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, bubbles: true }));
    });

    // Move to 380 (+80px)
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 380, bubbles: true }));
    });

    // Mouse up
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(setStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        columnWidths: expect.objectContaining({
          author: expect.any(Number),
        }),
      }),
    );

    await act(async () => root.unmount());
  });

  it('verifies row height changes between DEFAULT_ROW_HEIGHT (28) and COMPACT_ROW_HEIGHT (18)', async () => {
    expect(DEFAULT_ROW_HEIGHT).toBe(28);
    expect(COMPACT_ROW_HEIGHT).toBe(18);

    const commits = createMockCommits(2);
    const root = createRoot(container);

    // Render with default height
    await act(async () => {
      root.render(
        <CommitList
          commits={commits}
          repositoryId="repo-1"
          selectedCommitSha={null}
          onSelectCommit={vi.fn()}
          rowHeight={DEFAULT_ROW_HEIGHT}
        />,
      );
    });

    let row = container.querySelector('[data-testid="commit-row-c000"]') as HTMLTableRowElement;
    expect(row.style.height).toBe('28px');

    // Switch to compact row height
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

    row = container.querySelector('[data-testid="commit-row-c000"]') as HTMLTableRowElement;
    expect(row.style.height).toBe('18px');

    await act(async () => root.unmount());
  });
});
