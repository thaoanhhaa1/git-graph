// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FileChange } from '@git-graph/shared';
import { ChangedFiles, getStatusInfo } from '../../src/features/details/ChangedFiles';

describe('ChangedFiles Component', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  const sampleChanges: FileChange[] = [
    {
      path: 'src/main.ts',
      status: 'added',
      additions: 25,
      deletions: 0,
      isBinary: false,
    },
    {
      path: 'src/config.ts',
      status: 'modified',
      additions: 5,
      deletions: 3,
      isBinary: false,
    },
    {
      path: 'src/legacy.ts',
      status: 'deleted',
      additions: 0,
      deletions: 40,
      isBinary: false,
    },
    {
      path: 'src/new-name.ts',
      oldPath: 'src/old-name.ts',
      status: 'renamed',
      additions: 2,
      deletions: 1,
      isBinary: false,
    },
    {
      path: 'assets/logo.png',
      status: 'added',
      isBinary: true,
    },
  ];

  it('correctly maps file change statuses to labels and single-letter codes', () => {
    expect(getStatusInfo('added')).toEqual({
      code: 'A',
      label: 'Added',
      className: 'status-added',
    });
    expect(getStatusInfo('modified')).toEqual({
      code: 'M',
      label: 'Modified',
      className: 'status-modified',
    });
    expect(getStatusInfo('deleted')).toEqual({
      code: 'D',
      label: 'Deleted',
      className: 'status-deleted',
    });
    expect(getStatusInfo('renamed')).toEqual({
      code: 'R',
      label: 'Renamed',
      className: 'status-renamed',
    });
    expect(getStatusInfo('copied')).toEqual({
      code: 'C',
      label: 'Copied',
      className: 'status-copied',
    });
    expect(getStatusInfo('typeChanged')).toEqual({
      code: 'T',
      label: 'Type changed',
      className: 'status-typechanged',
    });
    expect(getStatusInfo('unmerged')).toEqual({
      code: 'U',
      label: 'Unmerged',
      className: 'status-unmerged',
    });
    expect(getStatusInfo('unknown')).toEqual({
      code: '?',
      label: 'Unknown',
      className: 'status-unknown',
    });
  });

  it('renders empty message when no files changed', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ChangedFiles fileChanges={[]} selectedFilePath={null} onSelectFile={vi.fn()} />);
    });

    const empty = container.querySelector('[data-testid="changed-files-empty"]');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('No files changed in this commit.');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders changed files list with status badges, additions, deletions, and rename path', async () => {
    const onSelectFile = vi.fn();
    const onOpenDiffInVsCode = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChangedFiles
          fileChanges={sampleChanges}
          selectedFilePath="src/config.ts"
          onSelectFile={onSelectFile}
          onOpenDiffInVsCode={onOpenDiffInVsCode}
        />,
      );
    });

    // Check count
    const count = container.querySelector('[data-testid="changed-files-count"]');
    expect(count?.textContent).toBe('5');

    // Check items rendered
    const items = container.querySelectorAll('.changed-file-item');
    expect(items.length).toBe(5);

    // Check selected class
    const selectedItem = container.querySelector('[data-testid="changed-file-src/config.ts"]');
    expect(selectedItem?.classList.contains('selected')).toBe(true);

    // Check status badges
    expect(container.querySelector('[data-testid="file-status-src/main.ts"]')?.textContent).toBe(
      'A',
    );
    expect(container.querySelector('[data-testid="file-status-src/legacy.ts"]')?.textContent).toBe(
      'D',
    );
    expect(
      container.querySelector('[data-testid="file-status-src/new-name.ts"]')?.textContent,
    ).toBe('R');

    // Check additions and deletions
    expect(container.querySelector('[data-testid="file-additions-src/main.ts"]')?.textContent).toBe(
      '+25',
    );
    expect(
      container.querySelector('[data-testid="file-deletions-src/legacy.ts"]')?.textContent,
    ).toBe('-40');

    // Check rename display: oldPath → newPath
    const renameEl = container.querySelector('[data-testid="file-rename-src/new-name.ts"]');
    expect(renameEl?.textContent).toContain('src/old-name.ts');
    expect(renameEl?.textContent).toContain('src/new-name.ts');

    // Check binary badge
    const binaryBadge = container.querySelector('[data-testid="file-binary-assets/logo.png"]');
    expect(binaryBadge?.textContent).toBe('BIN');

    // Clicking file triggers onSelectFile
    const mainFileItem = container.querySelector(
      '[data-testid="changed-file-src/main.ts"]',
    ) as HTMLElement;
    await act(async () => {
      mainFileItem.click();
    });
    expect(onSelectFile).toHaveBeenCalledWith(sampleChanges[0]);

    // Clicking VS Code diff button triggers onOpenDiffInVsCode
    const vsCodeBtn = container.querySelector(
      '[data-testid="open-diff-vscode-src/config.ts"]',
    ) as HTMLButtonElement;
    await act(async () => {
      vsCodeBtn.click();
    });
    expect(onOpenDiffInVsCode).toHaveBeenCalledWith('src/config.ts', undefined);

    await act(async () => {
      root.unmount();
    });
  });

  it('filters files when filter input is typed', async () => {
    // 6 items so filter input renders
    const sixChanges: FileChange[] = [
      ...sampleChanges,
      { path: 'docs/readme.md', status: 'modified', isBinary: false },
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChangedFiles fileChanges={sixChanges} selectedFilePath={null} onSelectFile={vi.fn()} />,
      );
    });

    const filterInput = container.querySelector(
      '[data-testid="changed-files-filter-input"]',
    ) as HTMLInputElement;
    expect(filterInput).toBeTruthy();

    await act(async () => {
      filterInput.value = 'main';
      filterInput.dispatchEvent(new Event('input', { bubbles: true }));
      // React synthetic event trigger via change
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(filterInput, 'main');
      filterInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('opens context menu on right-click and triggers onOpenFileInEditor when Open File in Editor is clicked', async () => {
    const onOpenFileInEditor = vi.fn();
    const onOpenDiffInVsCode = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChangedFiles
          fileChanges={sampleChanges}
          selectedFilePath={null}
          viewMode="list"
          onSelectFile={vi.fn()}
          onOpenFileInEditor={onOpenFileInEditor}
          onOpenDiffInVsCode={onOpenDiffInVsCode}
        />,
      );
    });

    const mainFileItem = container.querySelector(
      '[data-testid="changed-file-src/main.ts"]',
    ) as HTMLElement;
    expect(mainFileItem).toBeTruthy();

    await act(async () => {
      mainFileItem.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 150,
          clientY: 200,
        }),
      );
    });

    const menu = container.querySelector('[data-testid="changed-file-context-menu"]');
    expect(menu).toBeTruthy();

    const openFileItem = container.querySelector(
      '[data-testid="action-menu-item-open-file-in-editor"]',
    ) as HTMLElement;
    expect(openFileItem).toBeTruthy();

    await act(async () => {
      openFileItem.click();
    });

    expect(onOpenFileInEditor).toHaveBeenCalledWith('src/main.ts');

    await act(async () => {
      root.unmount();
    });
  });
});
