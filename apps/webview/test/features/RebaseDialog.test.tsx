// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RebaseDialog } from '../../src/features/dialogs/RebaseDialog';

describe('RebaseDialog', () => {
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

  it('shows source branch and target without published warning', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RebaseDialog
          target="main"
          currentBranch="feature/safe"
          isPublished={false}
          isOpen={true}
          onClose={vi.fn()}
          onRebase={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="rebase-dialog"] .rebase-dialog-title');
    expect(title?.textContent).toBe('Rebase feature/safe onto main');
    expect(container.querySelector('[data-testid="rebase-published-warning"]')).toBeNull();

    const confirmBtn = container.querySelector(
      '[data-testid="rebase-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('requires confirmation before rebasing a published branch', async () => {
    const onRebase = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RebaseDialog
          target="main"
          currentBranch="feature/safe"
          isPublished={true}
          upstream="origin/feature/safe"
          isOpen={true}
          onClose={vi.fn()}
          onRebase={onRebase}
        />,
      );
    });

    const warning = container.querySelector('[data-testid="rebase-published-warning"]');
    expect(warning?.textContent).toContain('origin/feature/safe');

    const confirmBtn = container.querySelector(
      '[data-testid="rebase-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const riskCheckbox = container.querySelector(
      '[data-testid="rebase-dialog-risk-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => riskCheckbox.click());
    expect(confirmBtn.disabled).toBe(false);

    await act(async () => confirmBtn.click());
    expect(onRebase).toHaveBeenCalledWith('main', false, true);

    await act(async () => root.unmount());
  });

  it('forwards the ignore-date option', async () => {
    const onRebase = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RebaseDialog
          target="main"
          currentBranch="feature/safe"
          isPublished={false}
          isOpen={true}
          onClose={vi.fn()}
          onRebase={onRebase}
        />,
      );
    });

    const ignoreDate = container.querySelector(
      '[data-testid="rebase-dialog-ignore-date-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => ignoreDate.click());

    const confirmBtn = container.querySelector(
      '[data-testid="rebase-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onRebase).toHaveBeenCalledWith('main', true, false);

    await act(async () => root.unmount());
  });

  it('resets risk confirmation when reopened', async () => {
    const root = createRoot(container);
    const props = {
      target: 'main',
      currentBranch: 'feature/safe',
      isPublished: true,
      onClose: vi.fn(),
      onRebase: vi.fn(),
    };

    await act(async () => {
      root.render(<RebaseDialog {...props} isOpen={true} />);
    });
    const riskCheckbox = container.querySelector(
      '[data-testid="rebase-dialog-risk-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => riskCheckbox.click());
    expect(riskCheckbox.checked).toBe(true);

    await act(async () => {
      root.render(<RebaseDialog {...props} isOpen={false} />);
    });
    await act(async () => {
      root.render(<RebaseDialog {...props} isOpen={true} />);
    });

    const reopened = container.querySelector(
      '[data-testid="rebase-dialog-risk-checkbox"]',
    ) as HTMLInputElement;
    expect(reopened.checked).toBe(false);

    await act(async () => root.unmount());
  });
});
