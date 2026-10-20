// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DateRangeSelector, formatDateYMD } from '../../src/features/toolbar/DateRangeSelector';
import { useGraphStore } from '../../src/stores/graphStore';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { setVsCodeApi, resetVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import type { MessageEnvelope } from '@git-graph/shared';

describe('DateRangeSelector', () => {
  let container: HTMLDivElement;
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    resetVsCodeApi();
    postedMessages = [];
    const mockApi = createMockVsCodeApi(undefined, (msg) => {
      postedMessages.push(msg as MessageEnvelope);
    });
    setVsCodeApi(mockApi);

    useRepositoryStore.getState().reset();
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo One', path: '/path/one' }]);
    useGraphStore.getState().reset();
    useGraphStore.getState().setActiveRepoId('repo-1');

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    resetVsCodeApi();
    vi.restoreAllMocks();
  });

  it('renders with default "all" selection and shows presets', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<DateRangeSelector />);
    });

    const select = container.querySelector(
      '[data-testid="date-range-select"]',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('all');

    await act(async () => {
      root.unmount();
    });
  });

  it('changes preset to "today" and requests commits with dateSince', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<DateRangeSelector />);
    });

    const select = container.querySelector(
      '[data-testid="date-range-select"]',
    ) as HTMLSelectElement;

    await act(async () => {
      select.value = 'today';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const todayStr = formatDateYMD(new Date());
    expect(useGraphStore.getState().filterDateSince).toBe(todayStr);
    expect(useGraphStore.getState().filterDateUntil).toBe('');

    // Verification of message requested
    const commitReq = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(commitReq).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('changes preset to "7d" and then back to "all"', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<DateRangeSelector />);
    });

    const select = container.querySelector(
      '[data-testid="date-range-select"]',
    ) as HTMLSelectElement;

    // Change to 7d
    await act(async () => {
      select.value = '7d';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const d7 = new Date();
    d7.setDate(d7.getDate() - 7);
    expect(useGraphStore.getState().filterDateSince).toBe(formatDateYMD(d7));

    // Change to all
    await act(async () => {
      select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGraphStore.getState().filterDateSince).toBe('');
    expect(useGraphStore.getState().filterDateUntil).toBe('');

    await act(async () => {
      root.unmount();
    });
  });

  it('opens custom date range dialog and applies custom since and until', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<DateRangeSelector />);
    });

    const select = container.querySelector(
      '[data-testid="date-range-select"]',
    ) as HTMLSelectElement;

    // Select custom
    await act(async () => {
      select.value = 'custom';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Dialog should be open
    const dialog = document.body.querySelector('[data-testid="custom-date-range-dialog"]');
    expect(dialog).toBeTruthy();

    const sinceInput = document.body.querySelector(
      '[data-testid="custom-date-since-input"]',
    ) as HTMLInputElement;
    const untilInput = document.body.querySelector(
      '[data-testid="custom-date-until-input"]',
    ) as HTMLInputElement;
    const applyBtn = document.body.querySelector(
      '[data-testid="custom-date-apply-btn"]',
    ) as HTMLButtonElement;

    expect(sinceInput).toBeTruthy();
    expect(untilInput).toBeTruthy();
    expect(applyBtn).toBeTruthy();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;

    await act(async () => {
      nativeSetter?.call(sinceInput, '2026-01-01');
      sinceInput.dispatchEvent(new Event('input', { bubbles: true }));
      sinceInput.dispatchEvent(new Event('change', { bubbles: true }));

      nativeSetter?.call(untilInput, '2026-06-30');
      untilInput.dispatchEvent(new Event('input', { bubbles: true }));
      untilInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      applyBtn.click();
    });

    expect(useGraphStore.getState().filterDateSince).toBe('2026-01-01');
    expect(useGraphStore.getState().filterDateUntil).toBe('2026-06-30');

    // Dialog should close
    expect(document.body.querySelector('[data-testid="custom-date-range-dialog"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
