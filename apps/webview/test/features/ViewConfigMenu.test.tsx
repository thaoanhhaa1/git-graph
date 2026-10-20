// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ViewConfigMenu } from '../../src/features/toolbar/ViewConfigMenu';
import { useConfigStore } from '../../src/stores/configStore';

describe('ViewConfigMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useConfigStore.getState().resetConfig();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('opens and closes view settings dropdown on trigger click', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ViewConfigMenu />);
    });

    const trigger = container.querySelector(
      '[data-testid="view-config-trigger"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(container.querySelector('[data-testid="view-config-dropdown"]')).toBeNull();

    // Open dropdown
    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector('[data-testid="view-config-dropdown"]')).toBeTruthy();

    // Close dropdown
    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector('[data-testid="view-config-dropdown"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('toggles column and ref visibility settings via checkboxes', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ViewConfigMenu />);
    });

    const trigger = container.querySelector(
      '[data-testid="view-config-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const authorCheckbox = container.querySelector(
      '[data-testid="toggle-show-author"]',
    ) as HTMLInputElement;
    const dateCheckbox = container.querySelector(
      '[data-testid="toggle-show-date"]',
    ) as HTMLInputElement;
    const remoteCheckbox = container.querySelector(
      '[data-testid="toggle-show-remote-branches"]',
    ) as HTMLInputElement;
    const tagCheckbox = container.querySelector(
      '[data-testid="toggle-show-tags"]',
    ) as HTMLInputElement;

    expect(authorCheckbox.checked).toBe(true);
    expect(dateCheckbox.checked).toBe(true);
    expect(remoteCheckbox.checked).toBe(true);
    expect(tagCheckbox.checked).toBe(true);

    // Toggle Author off
    await act(async () => {
      authorCheckbox.click();
    });
    expect(useConfigStore.getState().config.showAuthor).toBe(false);

    // Toggle Date off
    await act(async () => {
      dateCheckbox.click();
    });
    expect(useConfigStore.getState().config.showDate).toBe(false);

    // Toggle Remote branches off
    await act(async () => {
      remoteCheckbox.click();
    });
    expect(useConfigStore.getState().config.showRemoteBranches).toBe(false);

    // Toggle Tags off
    await act(async () => {
      tagCheckbox.click();
    });
    expect(useConfigStore.getState().config.showTags).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('changes date format between relative and absolute via radio buttons', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ViewConfigMenu />);
    });

    const trigger = container.querySelector(
      '[data-testid="view-config-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const radioAbsolute = container.querySelector(
      '[data-testid="radio-date-absolute"]',
    ) as HTMLInputElement;
    await act(async () => {
      radioAbsolute.click();
    });
    expect(useConfigStore.getState().config.dateType).toBe('absolute');

    const radioRelative = container.querySelector(
      '[data-testid="radio-date-relative"]',
    ) as HTMLInputElement;
    await act(async () => {
      radioRelative.click();
    });
    expect(useConfigStore.getState().config.dateType).toBe('relative');

    await act(async () => {
      root.unmount();
    });
  });

  it('changes commit ordering strategy via radio buttons', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ViewConfigMenu />);
    });

    const trigger = container.querySelector(
      '[data-testid="view-config-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const radioDate = container.querySelector(
      '[data-testid="radio-order-date"]',
    ) as HTMLInputElement;
    const radioTopo = container.querySelector(
      '[data-testid="radio-order-topo"]',
    ) as HTMLInputElement;
    const radioAuthorDate = container.querySelector(
      '[data-testid="radio-order-author-date"]',
    ) as HTMLInputElement;

    expect(radioDate).toBeTruthy();
    expect(radioTopo).toBeTruthy();
    expect(radioAuthorDate).toBeTruthy();
    expect(useConfigStore.getState().config.commitOrdering).toBe('date-order');

    await act(async () => {
      radioTopo.click();
    });
    expect(useConfigStore.getState().config.commitOrdering).toBe('topo-order');

    await act(async () => {
      radioAuthorDate.click();
    });
    expect(useConfigStore.getState().config.commitOrdering).toBe('author-date-order');

    await act(async () => {
      root.unmount();
    });
  });

  it('toggles compact mode via checkbox', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ViewConfigMenu />);
    });

    const trigger = container.querySelector(
      '[data-testid="view-config-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const compactCheckbox = container.querySelector(
      '[data-testid="toggle-compact-mode"]',
    ) as HTMLInputElement;
    expect(compactCheckbox).toBeTruthy();
    expect(compactCheckbox.checked).toBe(false);
    expect(useConfigStore.getState().config.compactMode).toBe(false);

    await act(async () => {
      compactCheckbox.click();
    });
    expect(useConfigStore.getState().config.compactMode).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
