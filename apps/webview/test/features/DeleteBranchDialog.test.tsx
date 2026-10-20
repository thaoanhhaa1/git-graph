// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeleteBranchDialog } from '../../src/features/dialogs/DeleteBranchDialog';

describe('DeleteBranchDialog', () => {
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

  it('renders correctly with branch name in title and default checkboxes', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteBranchDialog
          branchName="style/aircraft-capability-statistic"
          isOpen={true}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="delete-branch-dialog"]');
    expect(dialog).toBeTruthy();

    const title = container.querySelector(
      '[data-testid="delete-branch-dialog"] .delete-branch-title',
    );
    expect(title?.textContent).toBe(
      'Are you sure you want to delete the branch style/aircraft-capability-statistic?',
    );

    const forceCheckbox = container.querySelector(
      '[data-testid="delete-branch-force-checkbox"]',
    ) as HTMLInputElement;
    expect(forceCheckbox).toBeTruthy();
    expect(forceCheckbox.checked).toBe(false);

    const remoteCheckbox = container.querySelector(
      '[data-testid="delete-branch-remote-checkbox"]',
    ) as HTMLInputElement;
    expect(remoteCheckbox).toBeTruthy();
    expect(remoteCheckbox.checked).toBe(false);

    const confirmBtn = container.querySelector(
      '[data-testid="delete-branch-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.textContent).toBe('Yes, delete');

    const cancelBtn = container.querySelector(
      '[data-testid="delete-branch-cancel-btn"]',
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.textContent).toBe('Cancel');

    await act(async () => {
      root.unmount();
    });
  });

  it('handles confirmation with force delete and remote delete options', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteBranchDialog
          branchName="refs/heads/feature/old-branch"
          isOpen={true}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
    });

    const forceCheckbox = container.querySelector(
      '[data-testid="delete-branch-force-checkbox"]',
    ) as HTMLInputElement;
    const remoteCheckbox = container.querySelector(
      '[data-testid="delete-branch-remote-checkbox"]',
    ) as HTMLInputElement;

    await act(async () => {
      forceCheckbox.click();
      remoteCheckbox.click();
    });

    expect(forceCheckbox.checked).toBe(true);
    expect(remoteCheckbox.checked).toBe(true);

    const confirmBtn = container.querySelector(
      '[data-testid="delete-branch-confirm-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirmBtn.click();
    });

    expect(onDelete).toHaveBeenCalledWith('feature/old-branch', true, true);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('pre-checks remote delete for remote branches and strips origin/ prefix', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteBranchDialog
          branchName="origin/feature/remote-only"
          isOpen={true}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
    });

    const title = container.querySelector(
      '[data-testid="delete-branch-dialog"] .delete-branch-title',
    );
    expect(title?.textContent).toBe(
      'Are you sure you want to delete the branch feature/remote-only?',
    );

    const remoteCheckbox = container.querySelector(
      '[data-testid="delete-branch-remote-checkbox"]',
    ) as HTMLInputElement;
    expect(remoteCheckbox.checked).toBe(true);

    const confirmBtn = container.querySelector(
      '[data-testid="delete-branch-confirm-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirmBtn.click();
    });

    expect(onDelete).toHaveBeenCalledWith('feature/remote-only', false, true);

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers delete on Enter key and cancels on Escape key', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteBranchDialog
          branchName="main"
          isOpen={true}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
    });

    const overlay = container.querySelector(
      '[data-testid="delete-branch-dialog-overlay"]',
    ) as HTMLElement;

    // Press Escape
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Enter
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledWith('main', false, false);

    await act(async () => {
      root.unmount();
    });
  });

  it('returns null when isOpen is false', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteBranchDialog
          branchName="main"
          isOpen={false}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="delete-branch-dialog"]');
    expect(dialog).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
