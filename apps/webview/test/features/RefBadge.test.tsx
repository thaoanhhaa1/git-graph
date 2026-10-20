// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RefBadge,
  combineLocalAndRemoteRefs,
  type RefBadgeItem,
} from '../../src/features/refs/RefBadge';

describe('RefBadge', () => {
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

  it('renders HEAD badge with head styling and icon', async () => {
    const headRef: RefBadgeItem = {
      name: 'HEAD',
      type: 'head',
      targetSha: 'a1b2c3d',
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={headRef} />);
    });

    const badge = container.querySelector('[data-testid="ref-badge-head-HEAD"]') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('ref-badge-head')).toBe(true);
    expect(badge.classList.contains('ref-tag-head')).toBe(true);
    expect(badge.querySelector('.ref-badge-icon svg')).toBeTruthy();
    expect(badge.querySelector('.ref-badge-name')?.textContent).toBe('HEAD');
    expect(badge.getAttribute('title')).toContain('HEAD: HEAD');
    expect(badge.getAttribute('title')).toContain('Target: a1b2c3d');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders local branch badge with upstream tracking in tooltip', async () => {
    const branchRef: RefBadgeItem = {
      name: 'feature-login',
      fullName: 'refs/heads/feature-login',
      type: 'localBranch',
      upstream: 'origin/feature-login',
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={branchRef} />);
    });

    const badge = container.querySelector(
      '[data-testid="ref-badge-localBranch-feature-login"]',
    ) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('ref-badge-local')).toBe(true);
    expect(badge.classList.contains('ref-tag-branch')).toBe(true);
    expect(badge.querySelector('.ref-badge-icon svg')).toBeTruthy();
    expect(badge.querySelector('.ref-badge-name')?.textContent).toBe('feature-login');
    expect(badge.getAttribute('title')).toContain('Branch: refs/heads/feature-login');
    expect(badge.getAttribute('title')).toContain('Tracking: origin/feature-login');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders unified badge with remote tracking (Development | origin)', async () => {
    const branchRef: RefBadgeItem = {
      name: 'Development',
      fullName: 'refs/heads/Development',
      type: 'localBranch',
      remotes: ['origin'],
      isCurrent: true,
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={branchRef} color="#d71b78" />);
    });

    const badge = container.querySelector(
      '[data-testid="ref-badge-localBranch-Development"]',
    ) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.querySelector('.ref-badge-name')?.textContent).toBe('Development');
    expect(badge.querySelector('.ref-badge-divider')).toBeTruthy();
    expect(badge.querySelector('[data-testid="ref-badge-remotes"]')?.textContent).toBe('origin');
    expect(badge.getAttribute('title')).toContain('Remote: origin/Development');
    expect(badge.getAttribute('title')).toContain('Current Checked-Out Branch');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders remote branch badge with remote styling and icon', async () => {
    const remoteRef: RefBadgeItem = {
      name: 'origin/main',
      type: 'remoteBranch',
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={remoteRef} />);
    });

    const badge = container.querySelector(
      '[data-testid="ref-badge-remoteBranch-origin/main"]',
    ) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('ref-badge-remote')).toBe(true);
    expect(badge.querySelector('.ref-badge-icon svg')).toBeTruthy();
    expect(badge.querySelector('.ref-badge-name')?.textContent).toBe('origin/main');
    expect(badge.getAttribute('title')).toContain('Remote Branch: origin/main');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders annotated and lightweight tag badges with tag icon', async () => {
    const annotatedTag: RefBadgeItem = {
      name: 'v2.1.0',
      type: 'tag',
      tagType: 'annotated',
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={annotatedTag} />);
    });

    const badge = container.querySelector('[data-testid="ref-badge-tag-v2.1.0"]') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('ref-badge-tag')).toBe(true);
    expect(badge.classList.contains('ref-tag-tag')).toBe(true);
    expect(badge.querySelector('.ref-badge-icon svg')).toBeTruthy();
    expect(badge.querySelector('.ref-badge-name')?.textContent).toBe('v2.1.0');
    expect(badge.getAttribute('title')).toContain('Tag: v2.1.0 (annotated tag)');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders current branch badge with current class and title', async () => {
    const currentBranchRef: RefBadgeItem = {
      name: 'main',
      fullName: 'refs/heads/main',
      type: 'localBranch',
      isCurrent: true,
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={currentBranchRef} />);
    });

    const badge = container.querySelector(
      '[data-testid="ref-badge-localBranch-main"]',
    ) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('ref-badge-current')).toBe(true);
    expect(badge.getAttribute('data-is-current')).toBe('true');
    expect(badge.getAttribute('title')).toContain(
      'Current Checked-Out Branch: refs/heads/main (HEAD)',
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onDoubleClick handler when double-clicked', async () => {
    const branchRef: RefBadgeItem = {
      name: 'feature-awesome',
      fullName: 'refs/heads/feature-awesome',
      type: 'localBranch',
    };

    let doubleClickedRef: RefBadgeItem | null = null;
    const handleDoubleClick = (ref: RefBadgeItem) => {
      doubleClickedRef = ref;
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<RefBadge refItem={branchRef} onDoubleClick={handleDoubleClick} />);
    });

    const badge = container.querySelector(
      '[data-testid="ref-badge-localBranch-feature-awesome"]',
    ) as HTMLElement;
    expect(badge).toBeTruthy();

    await act(async () => {
      badge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(doubleClickedRef).toEqual(branchRef);

    await act(async () => {
      root.unmount();
    });
  });

  describe('combineLocalAndRemoteRefs helper', () => {
    it('combines local branch with matching remote branch on same commit', () => {
      const refs: RefBadgeItem[] = [
        { name: 'Development', fullName: 'refs/heads/Development', type: 'localBranch' },
        {
          name: 'origin/Development',
          fullName: 'refs/remotes/origin/Development',
          type: 'remoteBranch',
        },
        { name: 'test-extension', fullName: 'refs/heads/test-extension', type: 'localBranch' },
      ];

      const combined = combineLocalAndRemoteRefs(refs);
      expect(combined.length).toBe(2);
      expect(combined[0]?.name).toBe('Development');
      expect(combined[0]?.remotes).toEqual(['origin']);
      expect(combined[1]?.name).toBe('test-extension');
      expect(combined[1]?.remotes).toBeUndefined();
    });

    it('combines multiple remotes on same branch name', () => {
      const refs: RefBadgeItem[] = [
        { name: 'main', fullName: 'refs/heads/main', type: 'localBranch' },
        { name: 'origin/main', type: 'remoteBranch' },
        { name: 'upstream/main', type: 'remoteBranch' },
      ];

      const combined = combineLocalAndRemoteRefs(refs);
      expect(combined.length).toBe(1);
      expect(combined[0]?.name).toBe('main');
      expect(combined[0]?.remotes).toEqual(['origin', 'upstream']);
    });

    it('retains remote branch if no local branch matches on that commit', () => {
      const refs: RefBadgeItem[] = [
        { name: 'main', fullName: 'refs/heads/main', type: 'localBranch' },
        { name: 'origin/feature-standalone', type: 'remoteBranch' },
      ];

      const combined = combineLocalAndRemoteRefs(refs);
      expect(combined.length).toBe(2);
      expect(combined[0]?.name).toBe('main');
      expect(combined[0]?.remotes).toBeUndefined();
      expect(combined[1]?.name).toBe('origin/feature-standalone');
      expect(combined[1]?.type).toBe('remoteBranch');
    });
  });
});
