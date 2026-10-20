// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateBranchDialog } from '../../src/features/dialogs/CreateBranchDialog';

describe('CreateBranchDialog', () => {
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

  it('renders correctly with short commit sha in title and form fields', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="create-branch-dialog"]');
    expect(dialog).toBeTruthy();

    const title = container.querySelector(
      '[data-testid="create-branch-dialog"] .create-branch-title',
    );
    expect(title?.textContent).toBe('Create branch at commit e1a883e4:');

    const nameLabel = container.querySelector('[data-testid="create-branch-name-label"]');
    expect(nameLabel?.textContent).toBe('Name:');

    const nameInput = container.querySelector(
      '[data-testid="create-branch-name-input"]',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe('');

    const checkoutLabel = container.querySelector('[data-testid="create-branch-checkout-label"]');
    expect(checkoutLabel?.textContent).toBe('Check out:');

    const checkoutCheckbox = container.querySelector(
      '[data-testid="create-branch-checkout-checkbox"]',
    ) as HTMLInputElement;
    expect(checkoutCheckbox).toBeTruthy();
    expect(checkoutCheckbox.checked).toBe(false);

    const confirmBtn = container.querySelector(
      '[data-testid="create-branch-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.textContent).toBe('Create Branch');
    expect(confirmBtn.disabled).toBe(true);

    const cancelBtn = container.querySelector(
      '[data-testid="create-branch-cancel-btn"]',
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.textContent).toBe('Cancel');

    await act(async () => {
      root.unmount();
    });
  });

  it('enables confirm button when name is entered and calls onCreate on submit', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const nameInput = container.querySelector(
      '[data-testid="create-branch-name-input"]',
    ) as HTMLInputElement;
    const checkoutCheckbox = container.querySelector(
      '[data-testid="create-branch-checkout-checkbox"]',
    ) as HTMLInputElement;
    const confirmBtn = container.querySelector(
      '[data-testid="create-branch-confirm-btn"]',
    ) as HTMLButtonElement;

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(nameInput, 'feature/my-new-branch');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      checkoutCheckbox.click();
    });

    expect(confirmBtn.disabled).toBe(false);
    expect(checkoutCheckbox.checked).toBe(true);

    await act(async () => {
      confirmBtn.click();
    });

    expect(onCreate).toHaveBeenCalledWith('feature/my-new-branch', 'e1a883e4567890abcdef', true);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('handles Enter to submit and Escape to cancel', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const overlay = container.querySelector(
      '[data-testid="create-branch-dialog-overlay"]',
    ) as HTMLElement;
    const nameInput = container.querySelector(
      '[data-testid="create-branch-name-input"]',
    ) as HTMLInputElement;

    // Set name
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(nameInput, 'bugfix/issue-123');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Press Escape
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Enter
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCreate).toHaveBeenCalledWith('bugfix/issue-123', 'e1a883e4567890abcdef', false);

    await act(async () => {
      root.unmount();
    });
  });

  it('returns null when isOpen is false', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="create-branch-dialog"]');
    expect(dialog).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
