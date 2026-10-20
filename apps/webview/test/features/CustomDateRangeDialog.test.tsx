// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomDateRangeDialog } from '../../src/features/dialogs/CustomDateRangeDialog';

describe('CustomDateRangeDialog', () => {
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
      root.render(<CustomDateRangeDialog isOpen={false} onClose={vi.fn()} onApply={vi.fn()} />);
    });

    expect(container.querySelector('[data-testid="custom-date-range-dialog"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders with initial since and until dates', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CustomDateRangeDialog
          isOpen={true}
          initialSince="2026-01-01"
          initialUntil="2026-06-30"
          onClose={vi.fn()}
          onApply={vi.fn()}
        />,
      );
    });

    const dialog = container.querySelector('[data-testid="custom-date-range-dialog"]');
    expect(dialog).toBeTruthy();

    const sinceInput = container.querySelector(
      '[data-testid="custom-date-since-input"]',
    ) as HTMLInputElement;
    const untilInput = container.querySelector(
      '[data-testid="custom-date-until-input"]',
    ) as HTMLInputElement;

    expect(sinceInput.value).toBe('2026-01-01');
    expect(untilInput.value).toBe('2026-06-30');

    await act(async () => root.unmount());
  });

  it('allows updating dates and calls onApply with trimmed values', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<CustomDateRangeDialog isOpen={true} onClose={onClose} onApply={onApply} />);
    });

    const sinceInput = container.querySelector(
      '[data-testid="custom-date-since-input"]',
    ) as HTMLInputElement;
    const untilInput = container.querySelector(
      '[data-testid="custom-date-until-input"]',
    ) as HTMLInputElement;

    const setInputValue = (el: HTMLInputElement, value: string) => {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    await act(async () => {
      setInputValue(sinceInput, '2026-03-01');
      setInputValue(untilInput, '2026-03-31');
    });

    const applyBtn = container.querySelector(
      '[data-testid="custom-date-apply-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      applyBtn.click();
    });

    expect(onApply).toHaveBeenCalledWith('2026-03-01', '2026-03-31');
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('closes on Cancel click and Escape key', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<CustomDateRangeDialog isOpen={true} onClose={onClose} onApply={vi.fn()} />);
    });

    const cancelBtn = container.querySelector(
      '[data-testid="custom-date-cancel-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = container.querySelector(
      '[data-testid="custom-date-range-dialog-overlay"]',
    ) as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});
