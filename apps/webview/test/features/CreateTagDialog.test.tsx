// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateTagDialog, validateTagName } from '../../src/features/dialogs/CreateTagDialog';

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('validateTagName', () => {
  it('accepts valid tag names', () => {
    expect(validateTagName('v1.0.0').valid).toBe(true);
    expect(validateTagName('release/2026-10').valid).toBe(true);
  });

  it('rejects empty, dashed, whitespace and malformed names', () => {
    expect(validateTagName('  ').valid).toBe(false);
    expect(validateTagName('--force').valid).toBe(false);
    expect(validateTagName('bad name').valid).toBe(false);
    expect(validateTagName('bad..name').valid).toBe(false);
    expect(validateTagName('bad~name').valid).toBe(false);
    expect(validateTagName('name.lock').valid).toBe(false);
  });
});

describe('CreateTagDialog', () => {
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

  it('renders commit info and disables submit until a valid name is entered', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateTagDialog
          commitSha="e1a883e4567890abcdef"
          commitSubject="feat: add tag dialog"
          isOpen={true}
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />,
      );
    });

    const title = container.querySelector('[data-testid="create-tag-dialog"] .create-tag-title');
    expect(title?.textContent).toBe('Create tag at commit e1a883e4:');
    expect(container.querySelector('[data-testid="create-tag-commit-subject"]')?.textContent).toBe(
      'feat: add tag dialog',
    );

    const confirmBtn = container.querySelector(
      '[data-testid="create-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const messageInput = container.querySelector(
      '[data-testid="create-tag-message-input"]',
    ) as HTMLTextAreaElement;
    expect(messageInput.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it('shows validation error for invalid names', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateTagDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={true}
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />,
      );
    });

    const nameInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;

    await act(async () => {
      setInputValue(nameInput, 'bad name');
    });

    const error = container.querySelector('[data-testid="create-tag-name-error"]');
    expect(error?.textContent).toContain('whitespace');

    const confirmBtn = container.querySelector(
      '[data-testid="create-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it('submits an annotated tag with a message', async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateTagDialog
          commitSha="e1a883e4567890abcdef"
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const nameInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'v2.0.0'));

    const annotatedRadio = container.querySelector(
      '[data-testid="create-tag-type-annotated"]',
    ) as HTMLInputElement;
    await act(async () => annotatedRadio.click());

    const messageInput = container.querySelector(
      '[data-testid="create-tag-message-input"]',
    ) as HTMLTextAreaElement;
    expect(messageInput.disabled).toBe(false);
    await act(async () => setInputValue(messageInput, 'Release 2.0.0'));

    const confirmBtn = container.querySelector(
      '[data-testid="create-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    await act(async () => confirmBtn.click());

    expect(onCreate).toHaveBeenCalledWith('v2.0.0', 'annotated', 'Release 2.0.0', false, undefined);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('pushes to the selected remote when multiple remotes are available', async () => {
    const onCreate = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateTagDialog
          commitSha="e1a883e4567890abcdef"
          remotes={['origin', 'upstream']}
          isOpen={true}
          onClose={vi.fn()}
          onCreate={onCreate}
        />,
      );
    });

    const nameInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'v1.0.0'));

    const pushCheckbox = container.querySelector(
      '[data-testid="create-tag-push-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => pushCheckbox.click());

    const remoteSelect = container.querySelector(
      '[data-testid="create-tag-remote-select"]',
    ) as HTMLSelectElement;
    expect(remoteSelect).toBeTruthy();
    await act(async () => {
      remoteSelect.value = 'upstream';
      remoteSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = container.querySelector(
      '[data-testid="create-tag-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => confirmBtn.click());

    expect(onCreate).toHaveBeenCalledWith('v1.0.0', 'lightweight', undefined, true, 'upstream');

    await act(async () => root.unmount());
  });

  it('resets state when reopened', async () => {
    const root = createRoot(container);
    const props = {
      commitSha: 'e1a883e4567890abcdef',
      onClose: vi.fn(),
      onCreate: vi.fn(),
    };

    await act(async () => {
      root.render(<CreateTagDialog {...props} isOpen={true} />);
    });
    const nameInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'v9.9.9'));

    await act(async () => {
      root.render(<CreateTagDialog {...props} isOpen={false} />);
    });
    await act(async () => {
      root.render(<CreateTagDialog {...props} isOpen={true} />);
    });

    const reopenedInput = container.querySelector(
      '[data-testid="create-tag-name-input"]',
    ) as HTMLInputElement;
    expect(reopenedInput.value).toBe('');

    await act(async () => root.unmount());
  });
});
