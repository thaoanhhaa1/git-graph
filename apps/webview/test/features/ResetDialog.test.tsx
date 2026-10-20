// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResetDialog } from '../../src/features/dialogs/ResetDialog';

describe('ResetDialog', () => {
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

  it('shows target details and defaults to mixed mode', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResetDialog
          target="abcdef1234567890"
          targetSubject="feat: previous commit"
          targetAuthor="Ada Lovelace"
          targetDate="2026-10-01"
          isOpen={true}
          onClose={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="reset-dialog"] .reset-dialog-title');
    expect(title?.textContent).toBe('Reset current branch to commit abcdef12');

    const targetInfo = container.querySelector('[data-testid="reset-dialog-target"]');
    expect(targetInfo?.textContent).toContain('feat: previous commit');
    expect(targetInfo?.textContent).toContain('Ada Lovelace');
    expect(targetInfo?.textContent).toContain('2026-10-01');

    const mixed = container.querySelector(
      '[data-testid="reset-dialog-mode-mixed"]',
    ) as HTMLInputElement;
    expect(mixed.checked).toBe(true);

    await act(async () => root.unmount());
  });

  it('uses the initial mode when provided', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResetDialog
          target="abcdef1234567890"
          initialMode="soft"
          isOpen={true}
          onClose={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });

    const soft = container.querySelector(
      '[data-testid="reset-dialog-mode-soft"]',
    ) as HTMLInputElement;
    expect(soft.checked).toBe(true);

    await act(async () => root.unmount());
  });

  it('submits the selected non-hard mode without confirmation', async () => {
    const onReset = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResetDialog target="abcdef1234567890" isOpen={true} onClose={onClose} onReset={onReset} />,
      );
    });

    const soft = container.querySelector(
      '[data-testid="reset-dialog-mode-soft"]',
    ) as HTMLInputElement;
    await act(async () => soft.click());

    const confirmBtn = container.querySelector(
      '[data-testid="reset-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onReset).toHaveBeenCalledWith('abcdef1234567890', 'soft', false);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('guards hard reset behind a danger confirmation checkbox', async () => {
    const onReset = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResetDialog target="abcdef1234567890" isOpen={true} onClose={vi.fn()} onReset={onReset} />,
      );
    });

    const hard = container.querySelector(
      '[data-testid="reset-dialog-mode-hard"]',
    ) as HTMLInputElement;
    await act(async () => hard.click());

    expect(container.querySelector('[data-testid="reset-hard-warning"]')).toBeTruthy();

    const confirmBtn = container.querySelector(
      '[data-testid="reset-dialog-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(confirmBtn.textContent).toBe('Reset (Hard)');

    const confirmCheckbox = container.querySelector(
      '[data-testid="reset-dialog-hard-confirm-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => confirmCheckbox.click());
    expect(confirmBtn.disabled).toBe(false);

    await act(async () => confirmBtn.click());
    expect(onReset).toHaveBeenCalledWith('abcdef1234567890', 'hard', true);

    await act(async () => root.unmount());
  });

  it('hides the danger banner when leaving hard mode', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResetDialog target="abcdef1234567890" isOpen={true} onClose={vi.fn()} onReset={vi.fn()} />,
      );
    });

    const hard = container.querySelector(
      '[data-testid="reset-dialog-mode-hard"]',
    ) as HTMLInputElement;
    await act(async () => hard.click());
    expect(container.querySelector('[data-testid="reset-hard-warning"]')).toBeTruthy();

    const mixed = container.querySelector(
      '[data-testid="reset-dialog-mode-mixed"]',
    ) as HTMLInputElement;
    await act(async () => mixed.click());
    expect(container.querySelector('[data-testid="reset-hard-warning"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
