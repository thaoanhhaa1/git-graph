// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StashEntry } from '@git-graph/shared';
import { StashManagerDialog } from '../../src/features/dialogs/StashManagerDialog';

const stashes: StashEntry[] = [
  {
    index: 0,
    ref: 'stash@{0}',
    sha: 'a'.repeat(40),
    message: 'WIP on main: abc1234 feat: latest',
    branch: 'main',
    author: 'Ada',
    timestamp: 1700000000000,
  },
  {
    index: 1,
    ref: 'stash@{1}',
    sha: 'b'.repeat(40),
    message: 'On feature: older work',
    branch: 'feature',
    author: 'Bob',
    timestamp: 1690000000000,
  },
];

function click(el: Element | null) {
  if (!el) {
    throw new Error('Element not found');
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('StashManagerDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderDialog(
    props: Partial<React.ComponentProps<typeof StashManagerDialog>> = {},
  ) {
    const handlers = {
      onClose: vi.fn(),
      onApply: vi.fn(),
      onPop: vi.fn(),
      onDrop: vi.fn(),
      onCreateStash: vi.fn(),
    };
    await act(async () => {
      root.render(
        <StashManagerDialog
          isOpen={props.isOpen ?? true}
          stashes={props.stashes ?? stashes}
          isLoading={props.isLoading ?? false}
          {...handlers}
        />,
      );
    });
    return handlers;
  }

  it('lists stashes with ref, message, and branch', async () => {
    await renderDialog();

    expect(container.querySelector('[data-testid="stash-manager-list"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="stash-manager-item-"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="stash-ref-0"]')?.textContent).toBe('stash@{0}');
    expect(container.textContent).toContain('WIP on main: abc1234 feat: latest');
    expect(container.textContent).toContain('feature');
  });

  it('shows loading and empty states', async () => {
    await renderDialog({ isLoading: true, stashes: [] });
    expect(container.querySelector('[data-testid="stash-manager-loading"]')).not.toBeNull();

    await renderDialog({ stashes: [] });
    expect(container.querySelector('[data-testid="stash-manager-empty"]')?.textContent).toContain(
      'no stashes',
    );
  });

  it('invokes apply, pop, and drop for the selected entry', async () => {
    const handlers = await renderDialog();

    await act(async () => {
      click(container.querySelector('[data-testid="stash-apply-1"]'));
    });
    expect(handlers.onApply).toHaveBeenCalledWith(stashes[1]);

    await act(async () => {
      click(container.querySelector('[data-testid="stash-pop-0"]'));
    });
    expect(handlers.onPop).toHaveBeenCalledWith(stashes[0]);

    await act(async () => {
      click(container.querySelector('[data-testid="stash-drop-1"]'));
    });
    expect(handlers.onDrop).toHaveBeenCalledWith(stashes[1]);
  });

  it('renders the create and close actions', async () => {
    const handlers = await renderDialog();

    await act(async () => {
      click(container.querySelector('[data-testid="stash-manager-create-btn"]'));
    });
    expect(handlers.onCreateStash).toHaveBeenCalledTimes(1);

    await act(async () => {
      click(container.querySelector('[data-testid="stash-manager-close-btn"]'));
    });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the create action when no handler is provided', async () => {
    await act(async () => {
      root.render(
        <StashManagerDialog
          isOpen
          stashes={stashes}
          onClose={vi.fn()}
          onApply={vi.fn()}
          onPop={vi.fn()}
          onDrop={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-testid="stash-manager-create-btn"]')).toBeNull();
  });
});
