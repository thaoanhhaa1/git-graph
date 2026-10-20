// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RevertDialog } from '../../src/features/dialogs/RevertDialog';

const MERGE_PARENTS = [
  '1111111111111111111111111111111111111111',
  '2222222222222222222222222222222222222222',
];

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

  it('renders nothing when isOpen is false', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="abcdef1234567890"
          isOpen={false}
          onClose={vi.fn()}
          onRevert={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-testid="revert-dialog"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders revert dialog for a standard commit', async () => {
    const onRevert = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="1234567890abcdef"
          commitSubject="fix: critical bug"
          parents={['1111111111111111111111111111111111111111']}
          isOpen={true}
          onClose={onClose}
          onRevert={onRevert}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="revert-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Revert commit 12345678');
    expect(container.querySelector('[data-testid="revert-dialog-subject"]')?.textContent).toBe(
      'fix: critical bug',
    );
    expect(container.querySelector('[data-testid="revert-dialog-mainline-select"]')).toBeNull();

    const confirmBtn = container.querySelector(
      '[data-testid="revert-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onRevert).toHaveBeenCalledWith(undefined);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('handles merge commit mainline parent selection for revert', async () => {
    const onRevert = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="abcdef1234567890"
          commitSubject="Merge branch 'feature' into main"
          parents={MERGE_PARENTS}
          parentSubjects={{
            [MERGE_PARENTS[0]!]: 'main branch commit',
            [MERGE_PARENTS[1]!]: 'feature branch commit',
          }}
          isOpen={true}
          onClose={vi.fn()}
          onRevert={onRevert}
        />,
      );
    });

    const select = container.querySelector(
      '[data-testid="revert-dialog-mainline-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(2);
    expect(select.options[0]?.textContent).toContain('main branch commit');
    expect(select.options[1]?.textContent).toContain('feature branch commit');

    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="revert-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onRevert).toHaveBeenCalledWith(2);

    await act(async () => root.unmount());
  });

  it('closes on Cancel click and on Escape key', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RevertDialog
          commitSha="abcdef1234567890"
          isOpen={true}
          onClose={onClose}
          onRevert={vi.fn()}
        />,
      );
    });

    const cancelBtn = container.querySelector(
      '[data-testid="revert-dialog-cancel-btn"]',
    ) as HTMLButtonElement;
    await act(async () => cancelBtn.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = container.querySelector('[data-testid="revert-dialog-overlay"]') as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});
