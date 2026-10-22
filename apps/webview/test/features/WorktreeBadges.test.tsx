// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RefBadge } from '../../src/features/refs/RefBadge';
import { ChangedFiles } from '../../src/features/details/ChangedFiles';
import type { FileChange } from '@git-graph/shared';

describe('worktree and submodule badges', () => {
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

  it('renders a worktree indicator for a branch checked out elsewhere', async () => {
    await act(async () => {
      root.render(
        <RefBadge
          refItem={{ name: 'feature', type: 'localBranch' }}
          worktreePath="/repos/feature"
        />,
      );
    });

    const indicator = container.querySelector('[data-testid="ref-badge-worktree-feature"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('title')).toContain('/repos/feature');
  });

  it('renders a [submodule] badge for submodule file changes', async () => {
    const files: FileChange[] = [
      { path: 'libs/core', status: 'modified', isBinary: false, isSubmodule: true },
    ];

    await act(async () => {
      root.render(
        <ChangedFiles fileChanges={files} selectedFilePath={null} onSelectFile={() => undefined} />,
      );
    });

    const badge = container.querySelector('[data-testid="file-submodule-libs/core"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('[submodule]');
  });
});
