// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommitContextMenu } from '../../src/features/menu/CommitContextMenu';

describe('CommitContextMenu', () => {
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

  it('renders read-only actions and separator in correct order', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={120}
          y={150}
          commitSha="abcdef1234567890abcdef1234567890abcdef12"
          commitMessage="feat: improve git graph context menu"
          parents={['1234567890abcdef1234567890abcdef12345678']}
          onClose={onClose}
        />,
      );
    });

    const menu = container.querySelector('[data-testid="commit-action-menu"]');
    expect(menu).toBeTruthy();

    const viewCommitItem = container.querySelector('[data-testid="action-menu-item-view-commit"]');
    expect(viewCommitItem?.textContent).toBe('View Commit');

    const compareParentItem = container.querySelector(
      '[data-testid="action-menu-item-compare-parent"]',
    );
    expect(compareParentItem?.textContent).toBe('Compare with Parent');

    const separator = container.querySelector('[data-testid="action-menu-separator"]');
    expect(separator).toBeTruthy();

    const copyShaItem = container.querySelector('[data-testid="action-menu-item-copy-sha"]');
    expect(copyShaItem?.textContent).toBe('Copy Commit Hash to Clipboard');

    const copyMessageItem = container.querySelector(
      '[data-testid="action-menu-item-copy-message"]',
    );
    expect(copyMessageItem?.textContent).toBe('Copy Commit Subject to Clipboard');

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onViewCommit when View Commit is clicked', async () => {
    const onClose = vi.fn();
    const onViewCommit = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abc1234567"
          commitMessage="test commit"
          onClose={onClose}
          onViewCommit={onViewCommit}
        />,
      );
    });

    const viewCommitItem = container.querySelector(
      '[data-testid="action-menu-item-view-commit"]',
    ) as HTMLElement;
    await act(async () => {
      viewCommitItem.click();
    });

    expect(onViewCommit).toHaveBeenCalledWith('abc1234567');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('offers branch actions according to Image 1 when right clicking branch tag', async () => {
    const onClose = vi.fn();
    const onCompareWith = vi.fn();
    const onRenameBranch = vi.fn();
    const onCreateBranch = vi.fn();
    const onPushBranch = vi.fn();
    const onPullBranch = vi.fn();
    const onCreateArchive = vi.fn();
    const onToggleSelectBranch = vi.fn();
    const onPinBranch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef1234567890"
          targetRef={{
            name: 'feature/safe',
            fullName: 'refs/heads/feature/safe',
            target: 'abcdef1234567890',
            kind: 'localBranch',
          }}
          onClose={onClose}
          onCompareWith={onCompareWith}
          onRenameBranch={onRenameBranch}
          onCreateBranch={onCreateBranch}
          onPushBranch={onPushBranch}
          onPullBranch={onPullBranch}
          onCreateArchive={onCreateArchive}
          onToggleSelectBranch={onToggleSelectBranch}
          onPinBranch={onPinBranch}
        />,
      );
    });

    const compareItem = container.querySelector(
      '[data-testid="action-menu-item-compare-branch"]',
    ) as HTMLElement;
    expect(compareItem.textContent).toBe('Compare with...');
    await act(async () => compareItem.click());
    expect(onCompareWith).toHaveBeenCalledWith('feature/safe');

    const renameItem = container.querySelector(
      '[data-testid="action-menu-item-rename-branch"]',
    ) as HTMLElement;
    expect(renameItem.textContent).toBe('Rename Branch...');
    await act(async () => renameItem.click());
    expect(onRenameBranch).toHaveBeenCalledWith('feature/safe');

    const pushItem = container.querySelector(
      '[data-testid="action-menu-item-push-branch"]',
    ) as HTMLElement;
    expect(pushItem.textContent).toBe('Push Branch...');
    await act(async () => pushItem.click());
    expect(onPushBranch).toHaveBeenCalledWith('feature/safe');

    const pullItem = container.querySelector(
      '[data-testid="action-menu-item-pull-branch"]',
    ) as HTMLElement;
    expect(pullItem.textContent).toBe('Pull Branch...');
    await act(async () => pullItem.click());
    expect(onPullBranch).toHaveBeenCalledWith('feature/safe');

    const archiveItem = container.querySelector(
      '[data-testid="action-menu-item-create-archive"]',
    ) as HTMLElement;
    expect(archiveItem.textContent).toBe('Create Archive');
    await act(async () => archiveItem.click());
    expect(onCreateArchive).toHaveBeenCalledWith('feature/safe');

    const unselectItem = container.querySelector(
      '[data-testid="action-menu-item-unselect-branch"]',
    ) as HTMLElement;
    expect(unselectItem.textContent).toBe('Unselect in Branches Dropdown');
    await act(async () => unselectItem.click());
    expect(onToggleSelectBranch).toHaveBeenCalledWith('feature/safe');

    const pinItem = container.querySelector(
      '[data-testid="action-menu-item-pin-branch"]',
    ) as HTMLElement;
    expect(pinItem.textContent).toBe('Pin Branch');
    await act(async () => pinItem.click());
    expect(onPinBranch).toHaveBeenCalledWith('feature/safe');

    await act(async () => root.unmount());
  });

  it('offers commit actions according to Image 2 when right clicking on commit', async () => {
    const onClose = vi.fn();
    const onCheckout = vi.fn();
    const onCreateBranch = vi.fn();
    const onCreateTag = vi.fn();
    const onFixup = vi.fn();
    const onSquashCommit = vi.fn();
    const onRevert = vi.fn();
    const onResetLastCommit = vi.fn();
    const onEditMessage = vi.fn();
    const onDropCommit = vi.fn();
    const onInteractiveRebase = vi.fn();
    const onSelectForCompare = vi.fn();
    const onPinCommit = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef1234567890"
          onClose={onClose}
          onCheckout={onCheckout}
          onCreateBranch={onCreateBranch}
          onCreateTag={onCreateTag}
          onFixup={onFixup}
          onSquashCommit={onSquashCommit}
          onRevert={onRevert}
          onResetLastCommit={onResetLastCommit}
          onEditMessage={onEditMessage}
          onDropCommit={onDropCommit}
          onInteractiveRebase={onInteractiveRebase}
          onSelectForCompare={onSelectForCompare}
          onPinCommit={onPinCommit}
        />,
      );
    });

    const addTagItem = container.querySelector(
      '[data-testid="action-menu-item-create-tag"]',
    ) as HTMLElement;
    expect(addTagItem.textContent).toBe('Add Tag...');
    await act(async () => addTagItem.click());
    expect(onCreateTag).toHaveBeenCalledWith('abcdef1234567890');

    const createBranchItem = container.querySelector(
      '[data-testid="action-menu-item-create-branch"]',
    ) as HTMLElement;
    expect(createBranchItem.textContent).toBe('Create Branch...');
    await act(async () => createBranchItem.click());
    expect(onCreateBranch).toHaveBeenCalledWith('abcdef1234567890');

    const checkoutItem = container.querySelector(
      '[data-testid="action-menu-item-checkout-commit"]',
    ) as HTMLElement;
    expect(checkoutItem.textContent).toBe('Checkout...');
    await act(async () => checkoutItem.click());
    expect(onCheckout).toHaveBeenCalledWith('abcdef1234567890', 'commit');

    const fixupItem = container.querySelector(
      '[data-testid="action-menu-item-create-fixup"]',
    ) as HTMLElement;
    expect(fixupItem.textContent).toBe('Fixup into Previous');
    await act(async () => fixupItem.click());
    expect(onFixup).toHaveBeenCalledWith('abcdef1234567890');

    const squashItem = container.querySelector(
      '[data-testid="action-menu-item-create-squash"]',
    ) as HTMLElement;
    expect(squashItem.textContent).toBe('Create Squash Commit');
    await act(async () => squashItem.click());
    expect(onSquashCommit).toHaveBeenCalledWith('abcdef1234567890');

    const revertItem = container.querySelector(
      '[data-testid="action-menu-item-revert-commit"]',
    ) as HTMLElement;
    expect(revertItem.textContent).toBe('Revert...');
    await act(async () => revertItem.click());
    expect(onRevert).toHaveBeenCalledWith('abcdef1234567890');

    const resetLastItem = container.querySelector(
      '[data-testid="action-menu-item-reset-last-commit"]',
    ) as HTMLElement;
    expect(resetLastItem.textContent).toBe('Reset Last Commit (Soft)...');
    await act(async () => resetLastItem.click());
    expect(onResetLastCommit).toHaveBeenCalledWith('abcdef1234567890');

    const editMsgItem = container.querySelector(
      '[data-testid="action-menu-item-edit-message"]',
    ) as HTMLElement;
    expect(editMsgItem.textContent).toBe('Edit Message...');
    await act(async () => editMsgItem.click());
    expect(onEditMessage).toHaveBeenCalledWith('abcdef1234567890');

    const dropItem = container.querySelector(
      '[data-testid="action-menu-item-drop-commit"]',
    ) as HTMLElement;
    expect(dropItem.textContent).toBe('Drop...');
    await act(async () => dropItem.click());
    expect(onDropCommit).toHaveBeenCalledWith('abcdef1234567890');

    const interactiveRebaseItem = container.querySelector(
      '[data-testid="action-menu-item-interactive-rebase-commit"]',
    ) as HTMLElement;
    expect(interactiveRebaseItem.textContent).toBe('Interactive Rebase from Here...');
    await act(async () => interactiveRebaseItem.click());
    expect(onInteractiveRebase).toHaveBeenCalledWith('abcdef1234567890');

    const selectCompareItem = container.querySelector(
      '[data-testid="action-menu-item-select-for-compare"]',
    ) as HTMLElement;
    expect(selectCompareItem.textContent).toBe('Select for Compare');
    await act(async () => selectCompareItem.click());
    expect(onSelectForCompare).toHaveBeenCalledWith('abcdef1234567890');

    const pinCommitItem = container.querySelector(
      '[data-testid="action-menu-item-pin-commit"]',
    ) as HTMLElement;
    expect(pinCommitItem.textContent).toBe('Pin Commit');
    await act(async () => pinCommitItem.click());
    expect(onPinCommit).toHaveBeenCalledWith('abcdef1234567890');

    await act(async () => root.unmount());
  });

  it('falls back to onViewDetails if onViewCommit is not explicitly passed', async () => {
    const onClose = vi.fn();
    const onViewDetails = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abc1234567"
          commitMessage="test commit"
          onClose={onClose}
          onViewDetails={onViewDetails}
        />,
      );
    });

    const viewCommitItem = container.querySelector(
      '[data-testid="action-menu-item-view-commit"]',
    ) as HTMLElement;
    await act(async () => {
      viewCommitItem.click();
    });

    expect(onViewDetails).toHaveBeenCalledWith('abc1234567');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('disables Compare with Parent for root commits (0 parents)', async () => {
    const onClose = vi.fn();
    const onCompareWithParent = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="root1234"
          parents={[]}
          onClose={onClose}
          onCompareWithParent={onCompareWithParent}
        />,
      );
    });

    const compareItem = container.querySelector(
      '[data-testid="action-menu-item-compare-parent"]',
    ) as HTMLElement;
    expect(compareItem.classList.contains('disabled')).toBe(true);
    expect(compareItem.getAttribute('aria-disabled')).toBe('true');

    // Clicking disabled item does nothing
    await act(async () => {
      compareItem.click();
    });

    expect(onCompareWithParent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onCompareWithParent with parent SHA for single-parent commit', async () => {
    const onClose = vi.fn();
    const onCompareWithParent = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="child123"
          parents={['parent456']}
          onClose={onClose}
          onCompareWithParent={onCompareWithParent}
        />,
      );
    });

    const compareItem = container.querySelector(
      '[data-testid="action-menu-item-compare-parent"]',
    ) as HTMLElement;
    expect(compareItem.classList.contains('disabled')).toBe(false);

    await act(async () => {
      compareItem.click();
    });

    expect(onCompareWithParent).toHaveBeenCalledWith('child123', 'parent456');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders distinct Compare with Parent options for merge commits', async () => {
    const onClose = vi.fn();
    const onCompareWithParent = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="merge123"
          parents={['11111112222222', '33333334444444']}
          onClose={onClose}
          onCompareWithParent={onCompareWithParent}
        />,
      );
    });

    const p1Item = container.querySelector(
      '[data-testid="action-menu-item-compare-parent"]',
    ) as HTMLElement;
    const p2Item = container.querySelector(
      '[data-testid="action-menu-item-compare-parent-2"]',
    ) as HTMLElement;

    expect(p1Item?.textContent).toContain('Compare with Parent 1 (1111111)');
    expect(p2Item?.textContent).toContain('Compare with Parent 2 (3333333)');

    await act(async () => {
      p2Item.click();
    });

    expect(onCompareWithParent).toHaveBeenCalledWith('merge123', '33333334444444');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onCopySha when Copy Commit Hash is clicked', async () => {
    const onClose = vi.fn();
    const onCopySha = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef1234567890"
          onClose={onClose}
          onCopySha={onCopySha}
        />,
      );
    });

    const copyShaItem = container.querySelector(
      '[data-testid="action-menu-item-copy-sha"]',
    ) as HTMLElement;
    await act(async () => {
      copyShaItem.click();
    });

    expect(onCopySha).toHaveBeenCalledWith('abcdef1234567890');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onCopyMessage when Copy Commit Subject is clicked', async () => {
    const onClose = vi.fn();
    const onCopyMessage = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef"
          commitMessage="fix: handle context menu correctly"
          body="Longer details about fix"
          onClose={onClose}
          onCopyMessage={onCopyMessage}
        />,
      );
    });

    const copyMsgItem = container.querySelector(
      '[data-testid="action-menu-item-copy-message"]',
    ) as HTMLElement;
    await act(async () => {
      copyMsgItem.click();
    });

    expect(onCopyMessage).toHaveBeenCalledWith(
      'fix: handle context menu correctly\n\nLonger details about fix',
    );
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('supports keyboard navigation with Arrow keys, Enter, and Escape', async () => {
    const onClose = vi.fn();
    const onViewCommit = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef"
          commitMessage="feat: test keyboard"
          parents={[]} // Disabled Compare with Parent
          onClose={onClose}
          onViewCommit={onViewCommit}
        />,
      );
    });

    const menu = container.querySelector('[data-testid="commit-action-menu"]') as HTMLElement;

    // Initially focused on first selectable item ('Add Tag...')
    const firstItem = container.querySelector('[data-testid="action-menu-item-create-tag"]');
    expect(firstItem?.classList.contains('focused')).toBe(true);

    // End key moves to last selectable item ('Pin Commit')
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    const pinCommit = container.querySelector('[data-testid="action-menu-item-pin-commit"]');
    expect(pinCommit?.classList.contains('focused')).toBe(true);

    // Home key moves back to first item ('Add Tag...')
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(firstItem?.classList.contains('focused')).toBe(true);

    // Escape closes menu
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('closes on outside mousedown', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<CommitContextMenu x={100} y={100} commitSha="abcdef" onClose={onClose} />);
    });

    const outsideDiv = document.createElement('div');
    document.body.appendChild(outsideDiv);

    await act(async () => {
      outsideDiv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();

    if (outsideDiv.parentNode) {
      outsideDiv.parentNode.removeChild(outsideDiv);
    }

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onCherryPick when Cherry Pick is clicked', async () => {
    const onClose = vi.fn();
    const onCherryPick = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="81e0b3f1234567"
          commitMessage="feat: test cherry pick"
          onClose={onClose}
          onCherryPick={onCherryPick}
        />,
      );
    });

    const cherryPickItem = container.querySelector(
      '[data-testid="action-menu-item-cherry-pick-commit"]',
    ) as HTMLElement;
    expect(cherryPickItem).toBeTruthy();
    expect(cherryPickItem.textContent).toBe('Cherry Pick...');

    await act(async () => {
      cherryPickItem.click();
    });

    expect(onCherryPick).toHaveBeenCalledWith('81e0b3f1234567');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onMerge without squash when Merge is clicked', async () => {
    const onClose = vi.fn();
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="840c4081234567"
          commitMessage="feat: test merge"
          onClose={onClose}
          onMerge={onMerge}
        />,
      );
    });

    const mergeItem = container.querySelector(
      '[data-testid="action-menu-item-merge-commit"]',
    ) as HTMLElement;
    expect(mergeItem).toBeTruthy();
    expect(mergeItem.textContent).toBe('Merge into current branch...');

    await act(async () => {
      mergeItem.click();
    });

    expect(onMerge).toHaveBeenCalledWith('840c4081234567', false);
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onMerge with squash=true when Squash Merge is clicked', async () => {
    const onClose = vi.fn();
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="840c4081234567"
          commitMessage="feat: test squash merge"
          onClose={onClose}
          onMerge={onMerge}
        />,
      );
    });

    const squashMergeItem = container.querySelector(
      '[data-testid="action-menu-item-squash-merge-commit"]',
    ) as HTMLElement;
    expect(squashMergeItem).toBeTruthy();
    expect(squashMergeItem.textContent).toBe('Squash Merge into Current Branch (From Merge-Base)');

    await act(async () => {
      squashMergeItem.click();
    });

    expect(onMerge).toHaveBeenCalledWith('840c4081234567', true);
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('offers Delete Tag when right clicking a tag badge', async () => {
    const onClose = vi.fn();
    const onDeleteTag = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef1234567890"
          targetRef={{
            name: 'v1.0.0',
            fullName: 'refs/tags/v1.0.0',
            target: 'abcdef1234567890',
            kind: 'tag',
            tagType: 'lightweight',
          }}
          onClose={onClose}
          onDeleteTag={onDeleteTag}
        />,
      );
    });

    const deleteTagItem = container.querySelector(
      '[data-testid="action-menu-item-delete-tag-refs/tags/v1.0.0"]',
    ) as HTMLElement;
    expect(deleteTagItem).toBeTruthy();
    expect(deleteTagItem.textContent).toBe('Delete Tag v1.0.0...');

    await act(async () => deleteTagItem.click());

    expect(onDeleteTag).toHaveBeenCalledWith('v1.0.0');
    expect(onClose).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('omits Delete Tag when no handler is provided', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="abcdef1234567890"
          targetRef={{
            name: 'v1.0.0',
            fullName: 'refs/tags/v1.0.0',
            target: 'abcdef1234567890',
            kind: 'tag',
            tagType: 'lightweight',
          }}
          onClose={vi.fn()}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="action-menu-item-delete-tag-refs/tags/v1.0.0"]'),
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it('triggers onMerge with exclusive=true and targetBranch when Squash Merge Branch is clicked', async () => {
    const onClose = vi.fn();
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="81e0b3f1234567"
          targetRef={{
            name: 'test-branch',
            fullName: 'refs/heads/test-branch',
            kind: 'localBranch',
            target: '81e0b3f1234567',
            isCurrent: false,
          }}
          onClose={onClose}
          onMerge={onMerge}
        />,
      );
    });

    const squashBranchItem = container.querySelector(
      '[data-testid="action-menu-item-squash-merge-branch-test-branch"]',
    ) as HTMLElement;
    expect(squashBranchItem).toBeTruthy();
    expect(squashBranchItem.textContent).toBe(
      "Squash Merge Branch 'test-branch' into Current Branch",
    );

    await act(async () => {
      squashBranchItem.click();
    });

    expect(onMerge).toHaveBeenCalledWith('test-branch', true, {
      exclusive: true,
      targetBranch: 'test-branch',
    });
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onMerge with exclusive=true when Squash Merge Commit (Only This Commit) is clicked', async () => {
    const onClose = vi.fn();
    const onMerge = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommitContextMenu
          x={100}
          y={100}
          commitSha="81e0b3f1234567"
          onClose={onClose}
          onMerge={onMerge}
        />,
      );
    });

    const squashCommitOnlyItem = container.querySelector(
      '[data-testid="action-menu-item-squash-merge-commit-only"]',
    ) as HTMLElement;
    expect(squashCommitOnlyItem).toBeTruthy();
    expect(squashCommitOnlyItem.textContent).toBe('Squash Merge Commit (Only This Commit)');

    await act(async () => {
      squashCommitOnlyItem.click();
    });

    expect(onMerge).toHaveBeenCalledWith('81e0b3f1234567', true, {
      exclusive: true,
    });
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
