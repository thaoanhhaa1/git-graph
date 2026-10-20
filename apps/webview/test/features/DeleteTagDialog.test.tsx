// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeleteTagDialog } from '../../src/features/dialogs/DeleteTagDialog';

describe('DeleteTagDialog', () => {
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

  it('renders tag name and defaults to local-only deletion', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteTagDialog
          tagName="refs/tags/v1.0.0"
          isOpen={true}
          onClose={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="delete-tag-dialog"] .delete-tag-title');
    expect(title?.textContent).toBe('Are you sure you want to delete the tag v1.0.0?');

    const remoteCheckbox = container.querySelector(
      '[data-testid="delete-tag-remote-checkbox"]',
    ) as HTMLInputElement;
    expect(remoteCheckbox.checked).toBe(false);

    await act(async () => root.unmount());
  });

  it('deletes locally by default', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteTagDialog tagName="v1.0.0" isOpen={true} onClose={onClose} onDelete={onDelete} />,
      );
    });

    const confirmBtn = container.querySelector(
      '[data-testid="delete-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onDelete).toHaveBeenCalledWith('v1.0.0', false, undefined);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('deletes on the selected remote when requested', async () => {
    const onDelete = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteTagDialog
          tagName="v1.0.0"
          remotes={['origin', 'upstream']}
          isOpen={true}
          onClose={vi.fn()}
          onDelete={onDelete}
        />,
      );
    });

    const remoteCheckbox = container.querySelector(
      '[data-testid="delete-tag-remote-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => remoteCheckbox.click());

    const remoteSelect = container.querySelector(
      '[data-testid="delete-tag-remote-select"]',
    ) as HTMLSelectElement;
    expect(remoteSelect).toBeTruthy();
    await act(async () => {
      remoteSelect.value = 'upstream';
      remoteSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="delete-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onDelete).toHaveBeenCalledWith('v1.0.0', true, 'upstream');

    await act(async () => root.unmount());
  });

  it('cancels on Escape and confirms on Enter', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteTagDialog tagName="v1.0.0" isOpen={true} onClose={onClose} onDelete={onDelete} />,
      );
    });

    const overlay = container.querySelector(
      '[data-testid="delete-tag-dialog-overlay"]',
    ) as HTMLElement;

    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledWith('v1.0.0', false, undefined);

    await act(async () => root.unmount());
  });

  it('renders nothing when closed', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DeleteTagDialog tagName="v1.0.0" isOpen={false} onClose={vi.fn()} onDelete={vi.fn()} />,
      );
    });

    expect(container.querySelector('[data-testid="delete-tag-dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
