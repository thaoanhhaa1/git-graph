// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MergeDialog } from '../../src/features/dialogs/MergeDialog';

describe('MergeDialog', () => {
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

  it('shows source and target branches with default fast-forward mode', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MergeDialog
          target="feature/safe"
          currentBranch="main"
          isOpen={true}
          onClose={vi.fn()}
          onMerge={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="merge-dialog"] .merge-dialog-title');
    expect(title?.textContent).toBe('Merge feature/safe into main');

    const defaultMode = container.querySelector(
      '[data-testid="merge-dialog-ff-default"]',
    ) as HTMLInputElement;
    expect(defaultMode.checked).toBe(true);

    const noCommit = container.querySelector(
      '[data-testid="merge-dialog-no-commit-checkbox"]',
    ) as HTMLInputElement;
    expect(noCommit.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('submits the selected fast-forward mode', async () => {
    const onMerge = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MergeDialog
          target="feature/safe"
          currentBranch="main"
          isOpen={true}
          onClose={onClose}
          onMerge={onMerge}
        />,
      );
    });

    const ffOnly = container.querySelector(
      '[data-testid="merge-dialog-ff-only"]',
    ) as HTMLInputElement;
    await act(async () => ffOnly.click());

    const confirmBtn = container.querySelector(
      '[data-testid="merge-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onMerge).toHaveBeenCalledWith('feature/safe', 'ff-only', false, false);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('disables no-commit when squash is selected and submits squash', async () => {
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MergeDialog
          target="feature/safe"
          currentBranch="main"
          isOpen={true}
          onClose={vi.fn()}
          onMerge={onMerge}
        />,
      );
    });

    const noCommit = container.querySelector(
      '[data-testid="merge-dialog-no-commit-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => noCommit.click());
    expect(noCommit.checked).toBe(true);

    const squash = container.querySelector(
      '[data-testid="merge-dialog-squash-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => squash.click());
    expect(noCommit.checked).toBe(false);
    expect(noCommit.disabled).toBe(true);

    const confirmBtn = container.querySelector(
      '[data-testid="merge-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onMerge).toHaveBeenCalledWith('feature/safe', 'ff', true, false);

    await act(async () => root.unmount());
  });

  it('submits no-commit for a non-squash merge', async () => {
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MergeDialog
          target="feature/safe"
          currentBranch="main"
          isOpen={true}
          onClose={vi.fn()}
          onMerge={onMerge}
        />,
      );
    });

    const noCommit = container.querySelector(
      '[data-testid="merge-dialog-no-commit-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => noCommit.click());

    const confirmBtn = container.querySelector(
      '[data-testid="merge-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onMerge).toHaveBeenCalledWith('feature/safe', 'ff', false, true);

    await act(async () => root.unmount());
  });

  it('resets options when reopened', async () => {
    const root = createRoot(container);
    const props = {
      target: 'feature/safe',
      currentBranch: 'main',
      onClose: vi.fn(),
      onMerge: vi.fn(),
    };

    await act(async () => {
      root.render(<MergeDialog {...props} isOpen={true} />);
    });
    const ffOnly = container.querySelector(
      '[data-testid="merge-dialog-ff-only"]',
    ) as HTMLInputElement;
    await act(async () => ffOnly.click());

    await act(async () => {
      root.render(<MergeDialog {...props} isOpen={false} />);
    });
    await act(async () => {
      root.render(<MergeDialog {...props} isOpen={true} />);
    });

    const reopened = container.querySelector(
      '[data-testid="merge-dialog-ff-default"]',
    ) as HTMLInputElement;
    expect(reopened.checked).toBe(true);

    await act(async () => root.unmount());
  });
});
