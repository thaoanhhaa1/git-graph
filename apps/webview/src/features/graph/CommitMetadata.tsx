import React, { useMemo } from 'react';
import { RefBadge, type RefBadgeItem, combineLocalAndRemoteRefs } from '../refs/RefBadge';

export interface CommitMetadataProps {
  message: string;
  refs?: RefBadgeItem[];
  showRemoteBranches?: boolean;
  showTags?: boolean;
  badgeColor?: string;
  isUncommitted?: boolean;
  className?: string;
  onCheckoutRef?: (ref: RefBadgeItem) => void;
  onContextMenuRef?: (ref: RefBadgeItem, e: React.MouseEvent) => void;
  draggableRefs?: boolean;
  onRefDragStart?: (ref: RefBadgeItem, e: React.DragEvent<HTMLSpanElement>) => void;
  onRefDragEnd?: (ref: RefBadgeItem, e: React.DragEvent<HTMLSpanElement>) => void;
  onRefTouchStart?: (ref: RefBadgeItem, e: React.TouchEvent<HTMLSpanElement>) => void;
  worktreeBranches?: ReadonlyMap<string, string>;
}

export const CommitMetadata: React.FC<CommitMetadataProps> = React.memo(
  ({
    message,
    refs = [],
    showRemoteBranches = true,
    showTags = true,
    badgeColor,
    isUncommitted = false,
    className = '',
    onCheckoutRef,
    onContextMenuRef,
    draggableRefs = false,
    onRefDragStart,
    onRefDragEnd,
    onRefTouchStart,
    worktreeBranches,
  }) => {
    // Combine local and remote branches pointing to the same commit into unified badges
    const processedRefs = useMemo(() => {
      const combined = combineLocalAndRemoteRefs(refs, showRemoteBranches, showTags);
      if (!worktreeBranches || worktreeBranches.size === 0) {
        return combined;
      }
      return combined.map((ref) => {
        const worktreePath = worktreeBranches.get(ref.name);
        return worktreePath ? { ...ref, worktreePath } : ref;
      });
    }, [refs, showRemoteBranches, showTags, worktreeBranches]);

    return (
      <div className={`commit-metadata-wrapper ${className}`} data-testid="commit-metadata">
        {processedRefs.length > 0 && (
          <div className="commit-refs-container" data-testid="commit-refs-container">
            {processedRefs.map((ref) => (
              <RefBadge
                key={`${ref.type}-${ref.name}`}
                refItem={ref}
                originalName={ref.name}
                color={badgeColor}
                onDoubleClick={onCheckoutRef}
                onContextMenu={onContextMenuRef}
                draggable={draggableRefs && (ref.type === 'localBranch' || ref.type === 'branch')}
                onDragStart={onRefDragStart}
                onDragEnd={onRefDragEnd}
                onTouchStart={onRefTouchStart}
                worktreePath={ref.worktreePath}
              />
            ))}
          </div>
        )}
        <span
          className={`commit-subject ${isUncommitted ? 'commit-subject-uncommitted' : ''}`}
          title={message}
          aria-label={message}
          data-testid="commit-subject"
        >
          {message}
        </span>
      </div>
    );
  },
);

CommitMetadata.displayName = 'CommitMetadata';
