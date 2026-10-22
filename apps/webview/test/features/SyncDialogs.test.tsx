// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchDialog } from '../../src/features/dialogs/FetchDialog';
import { PullDialog } from '../../src/features/dialogs/PullDialog';
import { PushDialog } from '../../src/features/dialogs/PushDialog';
import { RemoteManagerDialog } from '../../src/features/dialogs/RemoteManagerDialog';
import type { RemoteInfo } from '@git-graph/shared';

const REMOTES: RemoteInfo[] = [
  { name: 'origin', fetchUrl: 'https://example.com/repo.git', pushUrl: 'git@example.com:repo.git' },
  {
    name: 'upstream',
    fetchUrl: 'https://example.com/upstream.git',
    pushUrl: 'https://example.com/upstream.git',
  },
];

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Remote synchronization dialogs', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  const render = async (element: React.ReactElement) => {
    const root = createRoot(container);
    await act(async () => {
      root.render(element);
    });
    return root;
  };

  describe('FetchDialog', () => {
    it('submits the default remote with prune enabled', async () => {
      const onFetch = vi.fn();
      const root = await render(
        <FetchDialog
          isOpen={true}
          remotes={REMOTES}
          defaultRemote="origin"
          onClose={vi.fn()}
          onFetch={onFetch}
        />,
      );

      expect(
        (container.querySelector('[data-testid="fetch-dialog-remote"]') as HTMLSelectElement).value,
      ).toBe('origin');
      expect(
        (container.querySelector('[data-testid="fetch-dialog-prune-checkbox"]') as HTMLInputElement)
          .checked,
      ).toBe(true);

      await act(async () => {
        (
          container.querySelector('[data-testid="fetch-dialog-confirm-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onFetch).toHaveBeenCalledWith({ remote: 'origin', prune: true, all: false });
      await act(async () => root.unmount());
    });

    it('falls back to fetching all remotes when none are configured', async () => {
      const onFetch = vi.fn();
      const root = await render(
        <FetchDialog isOpen={true} remotes={[]} onClose={vi.fn()} onFetch={onFetch} />,
      );

      expect(
        (container.querySelector('[data-testid="fetch-dialog-all-checkbox"]') as HTMLInputElement)
          .checked,
      ).toBe(true);

      await act(async () => {
        (
          container.querySelector('[data-testid="fetch-dialog-confirm-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onFetch).toHaveBeenCalledWith({ prune: true, all: true });
      await act(async () => root.unmount());
    });
  });

  describe('PullDialog', () => {
    it('submits selected strategy and autostash options', async () => {
      const onPull = vi.fn();
      const root = await render(
        <PullDialog
          isOpen={true}
          currentBranch="main"
          remotes={REMOTES}
          defaultRemote="origin"
          defaultBranch="main"
          onClose={vi.fn()}
          onPull={onPull}
        />,
      );

      expect(
        (container.querySelector('[data-testid="pull-dialog-branch"]') as HTMLInputElement).value,
      ).toBe('main');

      await act(async () => {
        (
          container.querySelector('[data-testid="pull-dialog-strategy-rebase"]') as HTMLInputElement
        ).click();
      });
      await act(async () => {
        (
          container.querySelector(
            '[data-testid="pull-dialog-autostash-checkbox"]',
          ) as HTMLInputElement
        ).click();
      });
      await act(async () => {
        (
          container.querySelector('[data-testid="pull-dialog-confirm-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onPull).toHaveBeenCalledWith({
        remote: 'origin',
        branch: 'main',
        strategy: 'rebase',
        autostash: true,
      });
      await act(async () => root.unmount());
    });

    it('disables submit when no remote is available', async () => {
      const root = await render(
        <PullDialog
          isOpen={true}
          currentBranch="main"
          remotes={[]}
          onClose={vi.fn()}
          onPull={vi.fn()}
        />,
      );

      expect(
        (container.querySelector('[data-testid="pull-dialog-confirm-btn"]') as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(container.querySelector('[data-testid="pull-dialog-no-remotes"]')).toBeTruthy();
      await act(async () => root.unmount());
    });
  });

  describe('PushDialog', () => {
    it('shows sync state and submits force-with-lease and tags', async () => {
      const onPush = vi.fn();
      const root = await render(
        <PushDialog
          isOpen={true}
          currentBranch="main"
          remotes={REMOTES}
          defaultRemote="origin"
          upstream="origin/main"
          ahead={2}
          behind={1}
          onClose={vi.fn()}
          onPush={onPush}
        />,
      );

      expect(
        container.querySelector('[data-testid="push-dialog-sync-status"]')?.textContent,
      ).toContain('↑ 2 ahead');
      expect(
        container.querySelector('[data-testid="push-dialog-sync-status"]')?.textContent,
      ).toContain('↓ 1 behind');
      expect(
        (
          container.querySelector(
            '[data-testid="push-dialog-set-upstream-checkbox"]',
          ) as HTMLInputElement
        ).checked,
      ).toBe(false);

      await act(async () => {
        (
          container.querySelector('[data-testid="push-dialog-force-checkbox"]') as HTMLInputElement
        ).click();
      });
      await act(async () => {
        (
          container.querySelector('[data-testid="push-dialog-tags-checkbox"]') as HTMLInputElement
        ).click();
      });
      await act(async () => {
        (
          container.querySelector('[data-testid="push-dialog-confirm-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onPush).toHaveBeenCalledWith({
        remote: 'origin',
        branchName: 'main',
        forceWithLease: true,
        setUpstream: false,
        tags: true,
      });
      expect(container.querySelector('[data-testid="push-dialog-force-warning"]')).toBeTruthy();
      await act(async () => root.unmount());
    });

    it('uses a branch override and enables set-upstream when no upstream exists', async () => {
      const onPush = vi.fn();
      const root = await render(
        <PushDialog
          isOpen={true}
          branchName="feature/demo"
          currentBranch="main"
          remotes={REMOTES}
          defaultRemote="origin"
          onClose={vi.fn()}
          onPush={onPush}
        />,
      );

      expect(
        (
          container.querySelector(
            '[data-testid="push-dialog-set-upstream-checkbox"]',
          ) as HTMLInputElement
        ).checked,
      ).toBe(true);
      await act(async () => {
        (
          container.querySelector('[data-testid="push-dialog-confirm-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onPush).toHaveBeenCalledWith({
        remote: 'origin',
        branchName: 'feature/demo',
        forceWithLease: false,
        setUpstream: true,
        tags: false,
      });
      await act(async () => root.unmount());
    });
  });

  describe('RemoteManagerDialog', () => {
    it('refreshes on open and adds a validated remote', async () => {
      const onRefresh = vi.fn();
      const onAdd = vi.fn();
      const root = await render(
        <RemoteManagerDialog
          isOpen={true}
          remotes={REMOTES}
          onClose={vi.fn()}
          onRefresh={onRefresh}
          onAdd={onAdd}
          onRemove={vi.fn()}
          onRename={vi.fn()}
          onSetUrl={vi.fn()}
        />,
      );

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-testid="remote-manager-row-origin"]')).toBeTruthy();

      const nameInput = container.querySelector(
        '[data-testid="remote-manager-add-name"]',
      ) as HTMLInputElement;
      const urlInput = container.querySelector(
        '[data-testid="remote-manager-add-url"]',
      ) as HTMLInputElement;
      await act(async () => {
        setInputValue(nameInput, 'fork');
        setInputValue(urlInput, 'https://example.com/fork.git');
      });
      await act(async () => {
        (
          container.querySelector('[data-testid="remote-manager-add-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onAdd).toHaveBeenCalledWith('fork', 'https://example.com/fork.git');
      await act(async () => root.unmount());
    });

    it('validates duplicate remote names before adding', async () => {
      const onAdd = vi.fn();
      const root = await render(
        <RemoteManagerDialog
          isOpen={true}
          remotes={REMOTES}
          onClose={vi.fn()}
          onRefresh={vi.fn()}
          onAdd={onAdd}
          onRemove={vi.fn()}
          onRename={vi.fn()}
          onSetUrl={vi.fn()}
        />,
      );

      const nameInput = container.querySelector(
        '[data-testid="remote-manager-add-name"]',
      ) as HTMLInputElement;
      const urlInput = container.querySelector(
        '[data-testid="remote-manager-add-url"]',
      ) as HTMLInputElement;
      await act(async () => {
        setInputValue(nameInput, 'origin');
        setInputValue(urlInput, 'https://example.com/duplicate.git');
      });
      await act(async () => {
        (
          container.querySelector('[data-testid="remote-manager-add-btn"]') as HTMLButtonElement
        ).click();
      });

      expect(onAdd).not.toHaveBeenCalled();
      expect(
        container.querySelector('[data-testid="remote-manager-add-error"]')?.textContent,
      ).toContain('already exists');
      await act(async () => root.unmount());
    });

    it('saves changed fetch and push URLs separately', async () => {
      const onSetUrl = vi.fn();
      const root = await render(
        <RemoteManagerDialog
          isOpen={true}
          remotes={REMOTES}
          onClose={vi.fn()}
          onRefresh={vi.fn()}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          onRename={vi.fn()}
          onSetUrl={onSetUrl}
        />,
      );

      await act(async () => {
        (
          container.querySelector('[data-testid="remote-manager-edit-origin"]') as HTMLButtonElement
        ).click();
      });
      const fetchUrl = container.querySelector(
        '[data-testid="remote-manager-fetch-url-origin"]',
      ) as HTMLInputElement;
      const pushUrl = container.querySelector(
        '[data-testid="remote-manager-push-url-origin"]',
      ) as HTMLInputElement;
      await act(async () => {
        setInputValue(fetchUrl, 'https://example.com/new.git');
        setInputValue(pushUrl, 'git@example.com:new.git');
      });
      await act(async () => {
        (
          container.querySelector(
            '[data-testid="remote-manager-save-url-origin"]',
          ) as HTMLButtonElement
        ).click();
      });

      expect(onSetUrl).toHaveBeenCalledWith('origin', 'https://example.com/new.git', false);
      expect(onSetUrl).toHaveBeenCalledWith('origin', 'git@example.com:new.git', true);
      await act(async () => root.unmount());
    });
  });
});
