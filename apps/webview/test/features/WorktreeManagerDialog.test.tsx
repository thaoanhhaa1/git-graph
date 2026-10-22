// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreeManagerDialog } from '../../src/features/dialogs/WorktreeManagerDialog';

const worktrees = [
  {
    path: '/repos/main',
    branch: 'main',
    headSha: 'a'.repeat(40),
    isCurrent: true,
  },
  {
    path: '/repos/feature',
    branch: 'feature/login',
    headSha: 'b'.repeat(40),
    isLocked: true,
    lockReason: 'in use',
  },
];

function click(element: Element | null) {
  if (!element) {
    throw new Error('Element not found');
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function changeValue(element: HTMLInputElement | null, value: string) {
  if (!element) {
    throw new Error('Input not found');
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('WorktreeManagerDialog', () => {
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

  async function renderDialog() {
    const handlers = {
      onClose: vi.fn(),
      onRefresh: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpen: vi.fn(),
    };
    await act(async () => {
      root.render(
        <WorktreeManagerDialog
          isOpen
          worktrees={worktrees}
          currentPath="/repos/main"
          {...handlers}
        />,
      );
    });
    return handlers;
  }

  it('lists worktrees with current and locked badges', async () => {
    await renderDialog();

    expect(
      container.querySelector('[data-testid="worktree-manager-row-/repos/main"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="worktree-manager-row-/repos/feature"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Current');
    expect(container.textContent).toContain('Locked');
  });

  it('creates a worktree from path, branch, and new branch inputs', async () => {
    const handlers = await renderDialog();

    act(() => {
      changeValue(
        container.querySelector('[data-testid="worktree-manager-add-path"]'),
        '/repos/new',
      );
      changeValue(
        container.querySelector('[data-testid="worktree-manager-add-branch"]'),
        'feature',
      );
      changeValue(
        container.querySelector('[data-testid="worktree-manager-add-new-branch"]'),
        'feature-2',
      );
    });
    act(() => click(container.querySelector('[data-testid="worktree-manager-add-btn"]')));

    expect(handlers.onAdd).toHaveBeenCalledWith('/repos/new', 'feature', 'feature-2');
  });

  it('requires a path before adding a worktree', async () => {
    const handlers = await renderDialog();

    act(() => click(container.querySelector('[data-testid="worktree-manager-add-btn"]')));

    expect(handlers.onAdd).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Worktree path is required.');
  });

  it('opens and removes a linked worktree with the force option', async () => {
    const handlers = await renderDialog();

    act(() =>
      click(container.querySelector('[data-testid="worktree-manager-open-/repos/feature"]')),
    );
    expect(handlers.onOpen).toHaveBeenCalledWith('/repos/feature');

    act(() =>
      click(container.querySelector('[data-testid="worktree-manager-remove-/repos/feature"]')),
    );
    act(() =>
      click(container.querySelector('[data-testid="worktree-manager-force-/repos/feature"]')),
    );
    act(() =>
      click(
        container.querySelector('[data-testid="worktree-manager-confirm-remove-/repos/feature"]'),
      ),
    );

    expect(handlers.onRemove).toHaveBeenCalledWith('/repos/feature', true);
  });

  it('does not allow removing the current worktree', async () => {
    await renderDialog();

    const removeButton = container.querySelector(
      '[data-testid="worktree-manager-remove-/repos/main"]',
    ) as HTMLButtonElement | null;
    expect(removeButton?.disabled).toBe(true);
  });
});
