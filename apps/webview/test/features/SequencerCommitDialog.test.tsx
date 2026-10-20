// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CherryPickDialog } from '../../src/features/dialogs/CherryPickDialog';
import { RevertDialog } from '../../src/features/dialogs/RevertDialog';

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

  it('renders commit summary without a mainline selector for regular commits', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          commitSubject="fix: correct graph lane"
          parents={['1111111111111111111111111111111111111111']}
          isOpen={true}
          onClose={vi.fn()}
          onCherryPick={vi.fn()}
        />,
      );
    });

    const title = container.querySelector(
      '[data-testid="cherry-pick-dialog"] .cherry-pick-dialog-title',
    );
    expect(title?.textContent).toBe('Cherry-pick commit abcdef12');
    expect(container.querySelector('[data-testid="cherry-pick-dialog-subject"]')?.textContent).toBe(
      'fix: correct graph lane',
    );
    expect(
      container.querySelector('[data-testid="cherry-pick-dialog-mainline-select"]'),
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it('submits cherry-pick without options for a regular commit', async () => {
    const onCherryPick = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          isOpen={true}
          onClose={onClose}
          onCherryPick={onCherryPick}
        />,
      );
    });

    const confirmBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onCherryPick).toHaveBeenCalledWith(undefined, false);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('shows a mainline selector for merge commits and forwards the chosen parent', async () => {
    const onCherryPick = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CherryPickDialog
          commitSha="abcdef1234567890"
          commitSubject="Merge pull request #42"
          parents={MERGE_PARENTS}
          parentSubjects={{
            [MERGE_PARENTS[0] as string]: 'main',
            [MERGE_PARENTS[1] as string]: 'feature/safe',
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
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.textContent).toContain('Parent 1');
    expect(select.options[0]?.textContent).toContain('main');
    expect(select.options[1]?.textContent).toContain('feature/safe');

    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const noCommit = container.querySelector(
      '[data-testid="cherry-pick-dialog-no-commit-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => noCommit.click());

    const confirmBtn = container.querySelector(
      '[data-testid="cherry-pick-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onCherryPick).toHaveBeenCalledWith(2, true);

    await act(async () => root.unmount());
  });
});

describe('RevertDialog', () => {
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

  it('renders revert title and no mainline selector for regular commits', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="abcdef1234567890"
          commitSubject="feat: risky change"
          parents={['1111111111111111111111111111111111111111']}
          isOpen={true}
          onClose={vi.fn()}
          onRevert={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="revert-dialog"] .revert-dialog-title');
    expect(title?.textContent).toBe('Revert commit abcdef12');
    expect(container.querySelector('[data-testid="revert-dialog-mainline-select"]')).toBeNull();
    expect(container.querySelector('[data-testid="revert-dialog-no-commit-checkbox"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('forwards the mainline parent for a merge commit revert', async () => {
    const onRevert = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="abcdef1234567890"
          parents={MERGE_PARENTS}
          isOpen={true}
          onClose={onClose}
          onRevert={onRevert}
        />,
      );
    });

    const select = container.querySelector(
      '[data-testid="revert-dialog-mainline-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();

    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="revert-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onRevert).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});
