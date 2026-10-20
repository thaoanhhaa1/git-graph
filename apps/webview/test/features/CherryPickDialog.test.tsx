// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CherryPickDialog } from '../../src/features/dialogs/CherryPickDialog';

const MERGE_PARENTS = [
  '1111111111111111111111111111111111111111',
  '2222222222222222222222222222222222222222',
];

describe('CherryPickDialog', () => {
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

  it('renders nothing when isOpen is false', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abc1234567890abcdef"
          isOpen={false}
          onClose={vi.fn()}
          onCherryPick={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-testid="cherry-pick-dialog"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders title and subject for a standard non-merge commit', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          commitSubject="feat: add cherry pick capability"
          parents={['1111111111111111111111111111111111111111']}
          isOpen={true}
          onClose={vi.fn()}
          onCherryPick={vi.fn()}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="cherry-pick-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Cherry-pick commit abcdef12');
    expect(container.querySelector('[data-testid="cherry-pick-dialog-subject"]')?.textContent).toBe(
      'feat: add cherry pick capability',
    );
    expect(
      container.querySelector('[data-testid="cherry-pick-dialog-mainline-select"]'),
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it('submits with noCommit flag toggled', async () => {
    const onCherryPick = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          commitSubject="feat: sample commit"
          isOpen={true}
          onClose={onClose}
          onCherryPick={onCherryPick}
        />,
      );
    });

    const noCommitCheckbox = container.querySelector(
      '[data-testid="cherry-pick-dialog-no-commit-checkbox"]',
    ) as HTMLInputElement;
    expect(noCommitCheckbox).toBeTruthy();
    expect(noCommitCheckbox.checked).toBe(false);

    await act(async () => {
      noCommitCheckbox.click();
    });
    expect(noCommitCheckbox.checked).toBe(true);

    const confirmBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });

    expect(onCherryPick).toHaveBeenCalledWith(undefined, true);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('handles merge commit mainline parent selection', async () => {
    const onCherryPick = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          commitSubject="Merge PR #10"
          parents={MERGE_PARENTS}
          parentSubjects={{
            [MERGE_PARENTS[0]!]: 'main branch head',
            [MERGE_PARENTS[1]!]: 'feature branch tip',
          }}
          isOpen={true}
          onClose={vi.fn()}
          onCherryPick={onCherryPick}
        />,
      );
    });

    const select = container.querySelector(
      '[data-testid="cherry-pick-dialog-mainline-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(2);
    expect(select.options[0]?.textContent).toContain('main branch head');
    expect(select.options[1]?.textContent).toContain('feature branch tip');

    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });

    expect(onCherryPick).toHaveBeenCalledWith(2, false);

    await act(async () => root.unmount());
  });

  it('triggers onClose when Cancel button or Escape key is pressed', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          isOpen={true}
          onClose={onClose}
          onCherryPick={vi.fn()}
        />,
      );
    });

    const cancelBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-cancel-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = container.querySelector(
      '[data-testid="cherry-pick-dialog-overlay"]',
    ) as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});
