// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenameBranchDialog } from '../../src/features/dialogs/RenameBranchDialog';

describe('RenameBranchDialog', () => {
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

  it('renders correctly with branch name in title and pre-filled input', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameBranchDialog
          branchName="main"
          isOpen={true}
          onClose={onClose}
          onRename={onRename}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="rename-branch-dialog"]');
    expect(dialog).toBeTruthy();

    const title = container.querySelector(
      '[data-testid="rename-branch-dialog"] .rename-branch-title',
    );
    expect(title?.textContent).toBe('Enter the new name for branch main:');

    const input = container.querySelector(
      '[data-testid="rename-branch-input"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('main');

    const confirmBtn = container.querySelector(
      '[data-testid="rename-branch-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.textContent).toBe('Rename Branch');
    expect(confirmBtn.disabled).toBe(false);

    const cancelBtn = container.querySelector(
      '[data-testid="rename-branch-cancel-btn"]',
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.textContent).toBe('Cancel');

    await act(async () => {
      root.unmount();
    });
  });

  it('handles renaming branch when user types a new name and clicks confirm', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameBranchDialog
          branchName="refs/heads/feature/old-branch"
          isOpen={true}
          onClose={onClose}
          onRename={onRename}
        />,
      );
    });

    const input = container.querySelector(
      '[data-testid="rename-branch-input"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('feature/old-branch');

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(input, 'feature/new-branch');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const checkbox = container.querySelector(
      '[data-testid="rename-branch-sync-remote-checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.click();
    });
    expect(checkbox.checked).toBe(true);

    const confirmBtn = container.querySelector(
      '[data-testid="rename-branch-confirm-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirmBtn.click();
    });

    expect(onRename).toHaveBeenCalledWith('feature/old-branch', 'feature/new-branch', true);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers rename on Enter key and cancels on Escape key', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameBranchDialog
          branchName="main"
          isOpen={true}
          onClose={onClose}
          onRename={onRename}
        />,
      );
    });

    const overlay = container.querySelector(
      '[data-testid="rename-branch-dialog-overlay"]',
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
    expect(onRename).toHaveBeenCalledWith('main', 'main', false);

    await act(async () => {
      root.unmount();
    });
  });

  it('handles remote branches correctly by stripping origin/ prefix and auto-checking syncRemote', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameBranchDialog
          branchName="origin/testne"
          isOpen={true}
          onClose={onClose}
          onRename={onRename}
        />,
      );
    });

    const title = container.querySelector(
      '[data-testid="rename-branch-dialog"] .rename-branch-title',
    );
    expect(title?.textContent).toBe('Enter the new name for branch testne:');

    const input = container.querySelector(
      '[data-testid="rename-branch-input"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('testne');

    const checkbox = container.querySelector(
      '[data-testid="rename-branch-sync-remote-checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(input, 'testne-renamed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="rename-branch-confirm-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirmBtn.click();
    });

    expect(onRename).toHaveBeenCalledWith('testne', 'testne-renamed', true);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('returns null when isOpen is false', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameBranchDialog
          branchName="main"
          isOpen={false}
          onClose={onClose}
          onRename={onRename}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="rename-branch-dialog"]');
    expect(dialog).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
