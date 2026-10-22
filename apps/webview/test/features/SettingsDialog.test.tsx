// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsDialog } from '../../src/features/settings/SettingsDialog';
import { useConfigStore } from '../../src/stores/configStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('SettingsDialog', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[];

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];
    setVsCodeApi(
      createMockVsCodeApi(undefined, (message) => {
        postedMessages.push(message as MessageEnvelope);
      }),
    );
    useConfigStore.getState().resetConfig();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    useConfigStore.getState().resetConfig();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  async function renderDialog() {
    const onClose = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<SettingsDialog isOpen onClose={onClose} />);
    });
    return { root, onClose };
  }

  it('renders all settings categories and the display panel by default', async () => {
    const { root } = await renderDialog();

    expect(container.querySelector('[data-testid="settings-dialog"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="settings-tab-display"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="settings-tab-git"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="settings-tab-graph"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="settings-tab-performance"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="settings-panel-display"]')).toBeTruthy();

    await act(async () => root.unmount());
  });

  it('applies a setting immediately and resets it to the default', async () => {
    const { root } = await renderDialog();

    const showAuthor = container.querySelector(
      '[data-testid="settings-show-author"]',
    ) as HTMLInputElement;
    await act(async () => {
      showAuthor.click();
    });

    expect(useConfigStore.getState().config.showAuthor).toBe(false);
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: 'view.config.update',
        payload: expect.objectContaining({ showAuthor: false }),
      }),
    );

    const resetButton = container.querySelector(
      '[data-testid="settings-reset-showAuthor"]',
    ) as HTMLButtonElement;
    expect(resetButton.disabled).toBe(false);
    await act(async () => resetButton.click());

    expect(useConfigStore.getState().config.showAuthor).toBe(true);
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: 'view.config.update',
        payload: expect.objectContaining({ showAuthor: true }),
      }),
    );

    await act(async () => root.unmount());
  });

  it('applies graph ordering and minimap settings from the graph tab', async () => {
    const { root } = await renderDialog();

    await act(async () => {
      (container.querySelector('[data-testid="settings-tab-graph"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-testid="settings-panel-graph"]')).toBeTruthy();

    await act(async () => {
      (container.querySelector('[data-testid="settings-order-topo"]') as HTMLInputElement).click();
    });
    expect(useConfigStore.getState().config.commitOrdering).toBe('topo-order');

    await act(async () => {
      (
        container.querySelector('[data-testid="settings-show-minimap"]') as HTMLInputElement
      ).click();
    });
    expect(useConfigStore.getState().config.showMinimap).toBe(false);

    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: 'view.config.update',
        payload: expect.objectContaining({ commitOrdering: 'topo-order' }),
      }),
    );
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: 'view.config.update',
        payload: expect.objectContaining({ showMinimap: false }),
      }),
    );

    await act(async () => root.unmount());
  });

  it('resets column widths from the performance tab', async () => {
    const { root } = await renderDialog();

    await act(async () => {
      (
        container.querySelector('[data-testid="settings-tab-performance"]') as HTMLButtonElement
      ).click();
    });

    const initialToken = useConfigStore.getState().columnWidthsResetToken;
    await act(async () => {
      (
        container.querySelector('[data-testid="settings-reset-column-widths"]') as HTMLButtonElement
      ).click();
    });
    expect(useConfigStore.getState().columnWidthsResetToken).toBe(initialToken + 1);

    await act(async () => root.unmount());
  });
});
