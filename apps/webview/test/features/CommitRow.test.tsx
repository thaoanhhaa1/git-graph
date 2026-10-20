// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommitRow, type CommitItem } from '../../src/features/graph/CommitRow';

describe('CommitRow', () => {
  let container: HTMLDivElement;

  const mockCommit: CommitItem = {
    hash: '1234567890abcdef1234567890abcdef12345678',
    shortHash: '1234567',
    message: 'feat: add initial commit row',
    author: 'Alice Developer',
    date: '2026-09-18',
    refs: [
      { name: 'HEAD', type: 'head' },
      { name: 'main', type: 'branch' },
      { name: 'v1.0.0', type: 'tag' },
    ],
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders commit details including hash, author, date, message and refs tags', async () => {
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow commit={mockCommit} isSelected={false} onSelect={onSelect} rowHeight={28} />
          </tbody>
        </table>,
      );
    });

    const row = container.querySelector(
      '[data-testid="commit-row-1234567"]',
    ) as HTMLTableRowElement;
    expect(row).toBeTruthy();
    expect(row.style.height).toBe('28px');
    expect(row.classList.contains('selected')).toBe(false);
    expect(row.getAttribute('aria-selected')).toBe('false');

    expect(container.querySelector('.commit-cell-hash')?.textContent).toBe('1234567');
    expect(container.querySelector('.commit-cell-author')?.textContent).toBe('Alice Developer');
    expect(container.querySelector('.commit-cell-date')?.textContent).toBe('2026-09-18');
    expect(container.querySelector('.commit-cell-message')?.textContent).toContain(
      'feat: add initial commit row',
    );

    // Ref tags
    const refTags = container.querySelectorAll('.ref-tag');
    expect(refTags.length).toBe(3);
    expect(refTags[0]?.textContent).toContain('HEAD');
    expect(refTags[0]?.classList.contains('ref-tag-head')).toBe(true);
    expect(refTags[1]?.textContent).toContain('main');
    expect(refTags[1]?.classList.contains('ref-tag-branch')).toBe(true);
    expect(refTags[2]?.textContent).toContain('v1.0.0');
    expect(refTags[2]?.classList.contains('ref-tag-tag')).toBe(true);

    // Tooltips
    expect(container.querySelector('.commit-cell-hash')?.getAttribute('title')).toContain(
      mockCommit.hash,
    );
    expect(container.querySelector('.commit-cell-author')?.getAttribute('title')).toContain(
      mockCommit.author,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('conditionally hides author and date columns based on props', async () => {
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={mockCommit}
              isSelected={false}
              onSelect={onSelect}
              showAuthor={false}
              showDate={false}
            />
          </tbody>
        </table>,
      );
    });

    expect(container.querySelector('.commit-cell-author')).toBeNull();
    expect(container.querySelector('.commit-cell-date')).toBeNull();
    expect(container.querySelector('.commit-cell-hash')).toBeTruthy();
    expect(container.querySelector('.commit-cell-message')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders relative date when dateType is relative and timestamp is provided', async () => {
    const onSelect = vi.fn();
    const now = 1773853200000;
    const commitWithTimestamp: CommitItem = {
      ...mockCommit,
      timestamp: now - 3600 * 1000 * 2, // 2 hours ago
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={commitWithTimestamp}
              isSelected={false}
              onSelect={onSelect}
              dateType="relative"
              now={now}
            />
          </tbody>
        </table>,
      );
    });

    const dateCell = container.querySelector('.commit-cell-date');
    expect(dateCell?.textContent).toBe('2h ago');

    await act(async () => {
      root.unmount();
    });
  });

  it('handles click and selects row with shortHash', async () => {
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow commit={mockCommit} isSelected={false} onSelect={onSelect} />
          </tbody>
        </table>,
      );
    });

    const row = container.querySelector(
      '[data-testid="commit-row-1234567"]',
    ) as HTMLTableRowElement;
    await act(async () => {
      row.click();
    });

    expect(onSelect).toHaveBeenCalledWith('1234567');

    await act(async () => {
      root.unmount();
    });
  });

  it('handles keyboard navigation with Enter and Space keys', async () => {
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow commit={mockCommit} isSelected={true} onSelect={onSelect} />
          </tbody>
        </table>,
      );
    });

    const row = container.querySelector(
      '[data-testid="commit-row-1234567"]',
    ) as HTMLTableRowElement;
    expect(row.classList.contains('selected')).toBe(true);
    expect(row.getAttribute('aria-selected')).toBe('true');

    // Press Enter
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('1234567');

    // Press Space
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(2);

    // Other key (e.g. Tab or arrow) does not invoke select
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders secondary-selected class when isSecondarySelected is true', async () => {
    const onSelect = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={mockCommit}
              isSelected={false}
              isSecondarySelected={true}
              onSelect={onSelect}
            />
          </tbody>
        </table>,
      );
    });

    const row = container.querySelector(
      '[data-testid="commit-row-1234567"]',
    ) as HTMLTableRowElement;
    expect(row.classList.contains('secondary-selected')).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onContextMenu on right-click or ContextMenu key', async () => {
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={mockCommit}
              isSelected={false}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          </tbody>
        </table>,
      );
    });

    const row = container.querySelector(
      '[data-testid="commit-row-1234567"]',
    ) as HTMLTableRowElement;

    // Right click
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(onContextMenu).toHaveBeenCalledTimes(1);

    // ContextMenu key
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    });
    expect(onContextMenu).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });
});
