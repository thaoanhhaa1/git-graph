// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmoduleStatusDialog } from '../../src/features/dialogs/SubmoduleStatusDialog';

const submodules = [
  {
    name: 'libs/core',
    path: 'libs/core',
    url: 'https://example.com/core.git',
    state: 'dirty' as const,
    ahead: 2,
    behind: 1,
  },
  {
    name: 'libs/empty',
    path: 'libs/empty',
    state: 'uninitialized' as const,
  },
];

function click(element: Element | null) {
  if (!element) {
    throw new Error('Element not found');
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('SubmoduleStatusDialog', () => {
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

  async function renderDialog() {
    const handlers = {
      onClose: vi.fn(),
      onRefresh: vi.fn(),
      onOpen: vi.fn(),
    };
    await act(async () => {
      root.render(<SubmoduleStatusDialog isOpen submodules={submodules} {...handlers} />);
    });
    return handlers;
  }

  it('renders submodule state, ahead/behind counts, and URLs', async () => {
    await renderDialog();

    expect(
      container.querySelector('[data-testid="submodule-status-row-libs/core"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Dirty');
    expect(container.textContent).toContain('2 ahead');
    expect(container.textContent).toContain('1 behind');
    expect(container.textContent).toContain('https://example.com/core.git');
  });

  it('opens an initialized submodule and disables uninitialized ones', async () => {
    const handlers = await renderDialog();

    click(container.querySelector('[data-testid="submodule-open-libs/core"]'));
    expect(handlers.onOpen).toHaveBeenCalledWith('libs/core');

    const uninitializedButton = container.querySelector(
      '[data-testid="submodule-open-libs/empty"]',
    ) as HTMLButtonElement | null;
    expect(uninitializedButton?.disabled).toBe(true);
  });
});
