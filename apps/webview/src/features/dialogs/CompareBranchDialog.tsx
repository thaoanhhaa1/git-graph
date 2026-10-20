import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { useGraphStore } from '../../stores/graphStore';
import { useRepositoryStore } from '../../stores/repositoryStore';
import type { Commit } from '@git-graph/shared';

export interface CompareBranchDialogProps {
  sourceBranch: string;
  sourceSha?: string;
  isOpen: boolean;
  onClose: () => void;
  onCompare: (sourceBranch: string, targetBranch: string, targetSha?: string) => void;
}

/**
 * Finds the commit SHA for a given branch name from the commit graph.
 */
export function findCommitShaForBranch(branchName: string, commits: Commit[]): string | undefined {
  const normalizedTarget = branchName.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
  for (const commit of commits) {
    for (const ref of commit.refs) {
      const cleanName = ref.name.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
      if (
        cleanName === normalizedTarget ||
        ref.name === branchName ||
        ref.name === `refs/heads/${normalizedTarget}` ||
        ref.name === `refs/remotes/${normalizedTarget}`
      ) {
        return commit.sha;
      }
    }
  }
  return undefined;
}

export const CompareBranchDialog: React.FC<CompareBranchDialogProps> = ({
  sourceBranch,
  isOpen,
  onClose,
  onCompare,
}) => {
  const activeRepo = useRepositoryStore((s) => s.getActiveRepository());
  const commits = useGraphStore((s) => s.commits);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Collect available branches excluding sourceBranch
  const availableBranches = useMemo(() => {
    const branches = new Set<string>();
    const cleanSource = sourceBranch.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');

    if (activeRepo?.currentBranch && activeRepo.currentBranch !== cleanSource) {
      branches.add(activeRepo.currentBranch);
    }

    for (const commit of commits) {
      for (const ref of commit.refs) {
        if (ref.kind === 'head' || ref.kind === 'localBranch' || ref.kind === 'remoteBranch') {
          const cleanName = ref.name.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
          if (cleanName && cleanName !== 'HEAD' && cleanName !== cleanSource) {
            branches.add(cleanName);
          }
        }
      }
    }

    // Default fallback branches if no other branch is found
    if (branches.size === 0) {
      if (cleanSource !== 'Development') branches.add('Development');
      if (cleanSource !== 'main') branches.add('main');
      if (cleanSource !== 'master') branches.add('master');
    }

    return Array.from(branches);
  }, [activeRepo?.currentBranch, commits, sourceBranch]);

  const [selectedTargetBranch, setSelectedTargetBranch] = useState<string>(
    availableBranches[0] || '',
  );

  // Update selected target when availableBranches changes
  useEffect(() => {
    if (availableBranches.length > 0 && !availableBranches.includes(selectedTargetBranch)) {
      setSelectedTargetBranch(availableBranches[0] || '');
    }
  }, [availableBranches, selectedTargetBranch]);

  // Focus select element when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        selectRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const target = selectedTargetBranch || availableBranches[0] || '';
    if (!target) {
      onClose();
      return;
    }
    const targetSha = findCommitShaForBranch(target, commits);
    onCompare(sourceBranch, target, targetSha);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="compare-branch-title"
      overlayClassName="compare-branch-modal-overlay"
      dialogClassName="compare-branch-dialog"
      overlayTestId="compare-branch-dialog-overlay"
      dialogTestId="compare-branch-dialog"
    >
      <ModalTitle className="compare-branch-title" id="compare-branch-title">
        Select branch to compare <em>{sourceBranch}</em> with:
      </ModalTitle>

      <Select
        ref={selectRef}
        className="compare-branch-select"
        value={selectedTargetBranch}
        onChange={(e) => setSelectedTargetBranch(e.target.value)}
        data-testid="compare-branch-select"
        aria-label="Target branch to compare"
        options={availableBranches.map((branch) => ({ value: branch, label: branch }))}
      />

      <ModalActions
        className="compare-branch-actions"
        actions={[
          {
            text: 'Compare',
            onClick: handleConfirm,
            testId: 'compare-branch-confirm-btn',
            className: 'compare-branch-btn primary',
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'compare-branch-cancel-btn',
            className: 'compare-branch-btn',
          },
        ]}
      />
    </Modal>
  );
};
