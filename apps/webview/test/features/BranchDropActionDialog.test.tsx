// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BranchDropActionDialog } from '../../src/features/dialogs/BranchDropActionDialog';
import type { RefBadgeItem } from '../../src/features/refs/RefBadge';

const source: RefBadgeItem = {
  name: 'feature-a',
  type: 'localBranch',
  targetSha: '1111111',
};

describe('BranchDropActionDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    vi.restoreAllMocks();
  });

  it('shows the dragged branch and target commit', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <BranchDropActionDialog
          isOpen
          source={source}
          targetSha="abcdef1234567890"
          targetShortSha="abcdef1"
          onClose={() => {}}
          onConfirm={() => {}}
        />,
      );
    });

    const title = container.querySelector('[data-testid="branch-drop-dialog"]');
    expect(title?.textContent).toContain('feature-a');
    expect(title?.textContent).toContain('abcdef1');

    await act(async () => root.unmount());
  });

  it('confirms merge by default and closes the dialog', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <BranchDropActionDialog
          isOpen
          source={source}
          targetSha="abcdef1234567890"
          targetShortSha="abcdef1"
          onClose={onClose}
          onConfirm={onConfirm}
        />,
      );
    });

    await act(async () => {
      (
        container.querySelector('[data-testid="branch-drop-confirm-btn"]') as HTMLButtonElement
      ).click();
    });

    expect(onConfirm).toHaveBeenCalledWith('merge', source);
    expect(onClose).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('confirms rebase and reset actions when selected', async () => {
    const onConfirm = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <BranchDropActionDialog
          isOpen
          source={source}
          targetSha="abcdef1234567890"
          targetShortSha="abcdef1"
          onClose={() => {}}
          onConfirm={onConfirm}
        />,
      );
    });

    await act(async () => {
      (
        container.querySelector('[data-testid="branch-drop-action-rebase"]') as HTMLInputElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector('[data-testid="branch-drop-confirm-btn"]') as HTMLButtonElement
      ).click();
    });
    expect(onConfirm).toHaveBeenLastCalledWith('rebase', source);

    await act(async () => {
      (
        container.querySelector('[data-testid="branch-drop-action-reset"]') as HTMLInputElement
      ).click();
    });
    await act(async () => {
      (
        container.querySelector('[data-testid="branch-drop-confirm-btn"]') as HTMLButtonElement
      ).click();
    });
    expect(onConfirm).toHaveBeenLastCalledWith('reset', source);

    await act(async () => root.unmount());
  });
});
