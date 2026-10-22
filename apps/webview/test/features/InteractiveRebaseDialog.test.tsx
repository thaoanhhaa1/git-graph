// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RebasePlanEntry } from '@git-graph/shared';
import { InteractiveRebaseDialog } from '../../src/features/dialogs/InteractiveRebaseDialog';
import { useInteractiveRebaseStore } from '../../src/stores/interactiveRebaseStore';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'cccccccccccccccccccccccccccccccccccccccc';

const entry = (sha: string, subject: string): RebasePlanEntry => ({
  action: 'pick',
  sha,
  shortSha: sha.slice(0, 7),
  subject,
  author: 'Tester',
  date: 0,
});

const plan = () => [entry(SHA_A, 'oldest'), entry(SHA_B, 'middle'), entry(SHA_C, 'newest')];

const renderDialog = async (
  props: Partial<React.ComponentProps<typeof InteractiveRebaseDialog>> = {},
) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const handlers = {
    onClose: vi.fn(),
    onStart: vi.fn(),
    onContinue: vi.fn(),
    onAbort: vi.fn(),
    onSkip: vi.fn(),
    ...props,
  };

  await act(async () => {
    root.render(<InteractiveRebaseDialog {...handlers} />);
  });

  return { container, root, handlers };
};

describe('InteractiveRebaseDialog', () => {
  beforeEach(() => {
    useInteractiveRebaseStore.getState().reset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the newest-first plan with reword inputs', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
      initialAction: { sha: SHA_B, action: 'reword' },
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const { container, root } = await renderDialog();

    const rows = container.querySelectorAll('[data-testid^="interactive-rebase-row-"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('newest');
    expect(rows[2]?.textContent).toContain('oldest');

    const message = container.querySelector(
      '[data-testid="interactive-rebase-message-1"]',
    ) as HTMLInputElement;
    expect(message.value).toBe('middle');

    await act(async () => root.unmount());
  });

  it('reorders entries when the move buttons are clicked', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const { container, root } = await renderDialog();

    const down = container.querySelector('[data-testid="interactive-rebase-down-0"]');
    await act(async () => {
      (down as HTMLButtonElement).click();
    });

    expect(useInteractiveRebaseStore.getState().entries.map((item) => item.subject)).toEqual([
      'middle',
      'newest',
      'oldest',
    ]);

    await act(async () => root.unmount());
  });

  it('reorders entries with drag and drop', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const { container, root } = await renderDialog();
    const store: Record<string, string> = {};
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (key: string, value: string) => {
        store[key] = value;
      },
      getData: (key: string) => store[key] ?? '',
    };

    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
    await act(async () => {
      container.querySelector('[data-testid="interactive-rebase-row-0"]')?.dispatchEvent(dragStart);
    });

    const drop = new Event('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
    await act(async () => {
      container.querySelector('[data-testid="interactive-rebase-row-2"]')?.dispatchEvent(drop);
    });

    expect(useInteractiveRebaseStore.getState().entries.map((item) => item.subject)).toEqual([
      'middle',
      'oldest',
      'newest',
    ]);

    await act(async () => root.unmount());
  });

  it('changes the action of a row through the select control', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const { container, root } = await renderDialog();

    const select = container.querySelector(
      '[data-testid="interactive-rebase-action-0"]',
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = 'drop';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useInteractiveRebaseStore.getState().entries[0]!.action).toBe('drop');
    expect(
      container.querySelector('[data-testid="interactive-rebase-row-0"]')?.className,
    ).toContain('is-dropped');

    await act(async () => root.unmount());
  });

  it('requires published-history confirmation before starting', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: true,
      upstream: 'origin/main',
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const { container, root, handlers } = await renderDialog();

    expect(
      container.querySelector('[data-testid="interactive-rebase-published-warning"]'),
    ).not.toBeNull();
    const start = container.querySelector(
      '[data-testid="interactive-rebase-start-btn"]',
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    const checkbox = container.querySelector(
      '[data-testid="interactive-rebase-risk-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    expect(start.disabled).toBe(false);

    await act(async () => {
      start.click();
    });
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onStart).toHaveBeenCalledWith(
      useInteractiveRebaseStore.getState().entries,
      true,
    );

    await act(async () => root.unmount());
  });

  it('blocks start when the first applied action is squash', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().setAction(2, 'squash');

    const { container, root } = await renderDialog();

    expect(container.querySelector('[data-testid="interactive-rebase-start-btn"]')).toHaveProperty(
      'disabled',
      true,
    );
    expect(container.textContent).toContain('first applied commit cannot be squashed');

    await act(async () => root.unmount());
  });

  it('shows conflict details and wires continue, skip, and abort', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().startRebase('req-1');
    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'req-1',
      success: false,
      error: {
        code: 'GIT_COMMAND_FAILED',
        message: 'Interactive rebase stopped with conflicts in 1 file(s).',
        details: {
          rebaseState: {
            inProgress: true,
            completedSteps: 1,
            totalSteps: 4,
            unmergedFiles: ['src/app.ts'],
          },
        },
      },
    });

    const { container, root, handlers } = await renderDialog();

    expect(
      container.querySelector('[data-testid="interactive-rebase-status"]')?.textContent,
    ).toContain('src/app.ts');
    expect(
      container.querySelector('[data-testid="interactive-rebase-progress"]')?.textContent,
    ).toContain('Step 1 / 4');

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="interactive-rebase-continue-btn"]',
        ) as HTMLButtonElement
      ).click();
      (
        container.querySelector('[data-testid="interactive-rebase-skip-btn"]') as HTMLButtonElement
      ).click();
      (
        container.querySelector('[data-testid="interactive-rebase-abort-btn"]') as HTMLButtonElement
      ).click();
    });

    expect(handlers.onContinue).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
    expect(handlers.onAbort).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('shows plan errors as a failure state', async () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan([], SHA_A, 'fatal: bad revision');

    const { container, root } = await renderDialog();

    expect(container.querySelector('[data-testid="interactive-rebase-error"]')?.textContent).toBe(
      'fatal: bad revision',
    );

    await act(async () => root.unmount());
  });
});
