// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Modal, ModalTitle } from '../../../src/components/ui/Modal';

describe('Modal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  const renderModal = async (props: Partial<React.ComponentProps<typeof Modal>> = {}) => {
    const onClose = props.onClose ?? vi.fn();
    const onConfirm = props.onConfirm ?? vi.fn();
    await act(async () => {
      root.render(
        <Modal
          isOpen
          onClose={onClose}
          onConfirm={onConfirm}
          titleId="test-title"
          overlayClassName="test-overlay"
          dialogClassName="test-dialog"
          overlayTestId="test-overlay"
          dialogTestId="test-dialog"
          {...props}
        >
          <ModalTitle className="test-title" id="test-title">
            Title
          </ModalTitle>
        </Modal>,
      );
    });
    return { onClose, onConfirm };
  };

  it('renders nothing when closed', async () => {
    await act(async () => {
      root.render(
        <Modal isOpen={false} onClose={vi.fn()} titleId="test-title">
          <div />
        </Modal>,
      );
    });
    expect(container.querySelector('[data-testid="test-overlay"]')).toBeNull();
  });

  it('renders accessible dialog semantics', async () => {
    await renderModal();
    const overlay = container.querySelector('[data-testid="test-overlay"]')!;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-labelledby')).toBe('test-title');
    expect(container.querySelector('#test-title')?.textContent).toBe('Title');
  });

  it('calls onClose on Escape', async () => {
    const { onClose } = await renderModal();
    const overlay = container.querySelector('[data-testid="test-overlay"]')!;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm on Enter', async () => {
    const { onConfirm } = await renderModal();
    const overlay = container.querySelector('[data-testid="test-overlay"]')!;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm when Enter is pressed while a button is focused', async () => {
    const { onClose, onConfirm } = await renderModal();
    const dialog = container.querySelector('[data-testid="test-dialog"]')!;
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    dialog.appendChild(cancelButton);

    await act(async () => {
      cancelButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not confirm when Enter is pressed inside a multiline textarea', async () => {
    const { onClose, onConfirm } = await renderModal();
    const dialog = container.querySelector('[data-testid="test-dialog"]')!;
    const textarea = document.createElement('textarea');
    dialog.appendChild(textarea);

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on overlay click but not on inner click', async () => {
    const { onClose } = await renderModal();
    const overlay = container.querySelector('[data-testid="test-overlay"]')!;
    const dialog = container.querySelector('[data-testid="test-dialog"]')!;

    await act(async () => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
