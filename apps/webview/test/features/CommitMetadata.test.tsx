// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommitMetadata } from '../../src/features/graph/CommitMetadata';
import type { RefBadgeItem } from '../../src/features/refs/RefBadge';

describe('CommitMetadata', () => {
  let container: HTMLDivElement;

  const mockRefs: RefBadgeItem[] = [
    { name: 'HEAD', type: 'head' },
    { name: 'main', type: 'localBranch' },
    { name: 'origin/main', type: 'remoteBranch' },
    { name: 'v1.0.0', type: 'tag' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders commit subject with title tooltip matching message', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<CommitMetadata message="feat(auth): add OAuth2 PKCE login flow" refs={[]} />);
    });

    const subject = container.querySelector('[data-testid="commit-subject"]');
    expect(subject?.textContent).toBe('feat(auth): add OAuth2 PKCE login flow');
    expect(subject?.getAttribute('title')).toBe('feat(auth): add OAuth2 PKCE login flow');

    await act(async () => {
      root.unmount();
    });
  });

  it('combines local and matching remote branch into unified badge', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitMetadata
          message="feat: initial commit"
          refs={mockRefs}
          showRemoteBranches={true}
          showTags={true}
        />,
      );
    });

    const badges = container.querySelectorAll('.ref-badge');
    expect(badges.length).toBe(3); // HEAD, main (origin), v1.0.0
    expect(container.querySelector('[data-testid="ref-badge-head-HEAD"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ref-badge-localBranch-main"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ref-badge-tag-v1.0.0"]')).toBeTruthy();

    const mainBadge = container.querySelector(
      '[data-testid="ref-badge-localBranch-main"]',
    ) as HTMLElement;
    expect(mainBadge.querySelector('.ref-badge-remotes')?.textContent).toBe('origin');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders standalone remote branch when no local branch matches on same commit', async () => {
    const standaloneRemoteRefs: RefBadgeItem[] = [
      { name: 'main', type: 'localBranch' },
      { name: 'origin/feature-standalone', type: 'remoteBranch' },
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitMetadata
          message="feat: standalone remote"
          refs={standaloneRemoteRefs}
          showRemoteBranches={true}
          showTags={true}
        />,
      );
    });

    const badges = container.querySelectorAll('.ref-badge');
    expect(badges.length).toBe(2);
    expect(container.querySelector('[data-testid="ref-badge-localBranch-main"]')).toBeTruthy();
    expect(
      container.querySelector('[data-testid="ref-badge-remoteBranch-origin/feature-standalone"]'),
    ).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('filters remote branch badges when showRemoteBranches is false', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitMetadata
          message="feat: initial commit"
          refs={mockRefs}
          showRemoteBranches={false}
          showTags={true}
        />,
      );
    });

    const badges = container.querySelectorAll('.ref-badge');
    expect(badges.length).toBe(3); // HEAD, main, v1.0.0
    const mainBadge = container.querySelector(
      '[data-testid="ref-badge-localBranch-main"]',
    ) as HTMLElement;
    expect(mainBadge.querySelector('.ref-badge-remotes')).toBeNull();
    expect(container.querySelector('[data-testid="ref-badge-tag-v1.0.0"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('filters tag badges when showTags is false', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitMetadata
          message="feat: initial commit"
          refs={mockRefs}
          showRemoteBranches={true}
          showTags={false}
        />,
      );
    });

    const badges = container.querySelectorAll('.ref-badge');
    expect(badges.length).toBe(2); // HEAD, main (origin)
    expect(container.querySelector('[data-testid="ref-badge-tag-v1.0.0"]')).toBeNull();
    expect(container.querySelector('[data-testid="ref-badge-localBranch-main"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it('invokes onCheckoutRef when a ref badge is double-clicked', async () => {
    let checkedOutRef: RefBadgeItem | null = null;
    const handleCheckoutRef = (ref: RefBadgeItem) => {
      checkedOutRef = ref;
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommitMetadata
          message="feat: initial commit"
          refs={mockRefs}
          onCheckoutRef={handleCheckoutRef}
        />,
      );
    });

    const branchBadge = container.querySelector(
      '[data-testid="ref-badge-localBranch-main"]',
    ) as HTMLElement;
    expect(branchBadge).toBeTruthy();

    await act(async () => {
      branchBadge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(checkedOutRef).toBeTruthy();
    expect((checkedOutRef as unknown as RefBadgeItem).name).toBe('main');

    await act(async () => {
      root.unmount();
    });
  });
});
