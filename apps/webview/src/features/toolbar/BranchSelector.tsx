import React from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { requestCommitsPage } from '../../messaging/messageRouter';
import { SelectField } from '../../components/ui/SelectField';
import { useDistinctOptions } from '../../hooks/useDistinctOptions';

export interface BranchSelectorProps {
  id?: string;
  disabled?: boolean;
  className?: string;
  onSelectBranch?: (branch: string) => void;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  id = 'branch-select',
  disabled = false,
  className = 'select-control',
  onSelectBranch,
}) => {
  const repositories = useRepositoryStore((s) => s.repositories);
  const activeRepo = useRepositoryStore((s) => s.getActiveRepository());
  const selectedBranch = useGraphStore((s) => s.selectedBranch);
  const commits = useGraphStore((s) => s.commits);
  const isGraphLoading = useGraphStore((s) => s.isLoading);

  // Collect distinct branch names from active repo and commit refs
  const getBranchNames = React.useCallback(
    function* (): IterableIterator<string> {
      if (activeRepo?.currentBranch) {
        yield activeRepo.currentBranch;
      }
      // Also include 'main' as standard default if not present
      yield 'main';

      for (const commit of commits) {
        for (const ref of commit.refs) {
          if (ref.kind === 'head' || ref.kind === 'localBranch' || ref.kind === 'remoteBranch') {
            // Normalize ref name if it has heads/ prefix
            const cleanName = ref.name.replace(/^refs\/heads\//, '');
            if (cleanName && cleanName !== 'HEAD') {
              yield cleanName;
            }
          }
        }
      }
    },
    [activeRepo?.currentBranch, commits],
  );

  const branchOptions = useDistinctOptions(getBranchNames);

  const isControlDisabled = disabled || isGraphLoading || repositories.length === 0;

  const options: { value: string; label: string }[] = [
    { value: 'all', label: 'Show All' },
    ...(activeRepo?.currentBranch
      ? [
          {
            value: activeRepo.currentBranch,
            label: `Current Branch (${activeRepo.currentBranch})`,
          },
        ]
      : []),
    ...branchOptions
      .filter((b) => b !== activeRepo?.currentBranch)
      .map((branch) => ({ value: branch, label: branch })),
  ];

  return (
    <SelectField
      id={id}
      label="Branches:"
      ariaLabel="Filter by branch"
      wrapperClassName="toolbar-control-wrapper"
      className={className}
      value={selectedBranch}
      onChange={(nextBranch) => {
        if (onSelectBranch) {
          onSelectBranch(nextBranch);
        } else {
          useGraphStore.getState().setSelectedBranch(nextBranch);
          useSelectionStore.getState().clearSelection();
          requestCommitsPage();
        }
      }}
      disabled={isControlDisabled}
      testId="branch-select"
      options={options}
    />
  );
};
