// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StashSaveDialog } from '../../src/features/dialogs/StashSaveDialog';

function click(el: Element | null) {
  if (!el) {
    throw new Error('Element not found');
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setInputValue(el: HTMLInputElement | null, value: string) {
  if (!el) {
    throw new Error('Input not found');
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('StashSaveDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderDialog(props: Partial<React.ComponentProps<typeof StashSaveDialog>> = {}) {
    const onClose = props.onClose ?? vi.fn();
    const onSave = props.onSave ?? vi.fn();
    await act(async () => {
      root.render(
        <StashSaveDialog isOpen={props.isOpen ?? true} onClose={onClose} onSave={onSave} />,
      );
    });
    return { onClose, onSave };
  }

  it('renders the dialog when open and nothing when closed', async () => {
    await renderDialog();
    expect(container.querySelector('[data-testid="stash-save-dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      root.render(<StashSaveDialog isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />);
    });
    expect(container.querySelector('[data-testid="stash-save-dialog"]')).toBeNull();
  });

  it('saves with default options and closes', async () => {
    const { onClose, onSave } = await renderDialog();

    await act(async () => {
      click(container.querySelector('[data-testid="stash-save-dialog-confirm-btn"]'));
    });

    expect(onSave).toHaveBeenCalledWith({
      includeUntracked: false,
      keepIndex: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes message, untracked, and keep-index options', async () => {
    const { onSave } = await renderDialog();

    await act(async () => {
      setInputValue(
        container.querySelector('[data-testid="stash-save-dialog-message"]') as HTMLInputElement,
        '  wip feature  ',
      );
    });
    await act(async () => {
      click(container.querySelector('[data-testid="stash-save-dialog-untracked-checkbox"]'));
      click(container.querySelector('[data-testid="stash-save-dialog-keep-index-checkbox"]'));
    });

    await act(async () => {
      click(container.querySelector('[data-testid="stash-save-dialog-confirm-btn"]'));
    });

    expect(onSave).toHaveBeenCalledWith({
      message: 'wip feature',
      includeUntracked: true,
      keepIndex: true,
    });
  });

  it('cancels via the cancel button and Escape key', async () => {
    const { onClose, onSave } = await renderDialog();

    await act(async () => {
      click(container.querySelector('[data-testid="stash-save-dialog-cancel-btn"]'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      container
        .querySelector('[data-testid="stash-save-dialog"]')
        ?.parentElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
