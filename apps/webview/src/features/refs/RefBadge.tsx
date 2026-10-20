import React from 'react';
import { Icon } from '../../components/ui/Icon';
import type { IconName } from '../../components/ui/icons';

export type RefBadgeType = 'head' | 'localBranch' | 'remoteBranch' | 'tag' | 'branch';

export interface RefBadgeItem {
  name: string;
  fullName?: string;
  type: RefBadgeType;
  isCurrent?: boolean;
  upstream?: string;
  tagType?: 'lightweight' | 'annotated';
  targetSha?: string;
  remotes?: string[];
}

export interface RefBadgeProps {
  refItem: RefBadgeItem;
  originalName?: string;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  isCompanion?: boolean;
  remoteName?: string;
  remotes?: string[];
  onClick?: (refItem: RefBadgeItem, e: React.MouseEvent) => void;
  onDoubleClick?: (refItem: RefBadgeItem, e: React.MouseEvent) => void;
  onContextMenu?: (refItem: RefBadgeItem, e: React.MouseEvent) => void;
}

/**
 * Maps a ref kind to the registry icon used in the badge.
 */
function getRefIconName(type: RefBadgeType): IconName {
  switch (type) {
    case 'head':
      return 'ref-head';
    case 'tag':
      return 'ref-tag';
    case 'remoteBranch':
    case 'localBranch':
    case 'branch':
    default:
      return 'ref-branch';
  }
}

/**
 * Returns CSS class modifier for the ref kind.
 */
function getBadgeClassModifier(type: RefBadgeType): string {
  switch (type) {
    case 'head':
      return 'ref-badge-head';
    case 'tag':
      return 'ref-badge-tag';
    case 'remoteBranch':
      return 'ref-badge-remote';
    case 'localBranch':
    case 'branch':
    default:
      return 'ref-badge-local';
  }
}

/**
 * Builds an accessible and informative tooltip text for the ref badge.
 */
function buildRefTooltip(refItem: RefBadgeItem, remotes: string[] = []): string {
  const parts: string[] = [];
  const displayName = refItem.fullName || refItem.name;

  if (refItem.isCurrent) {
    parts.push(`Current Checked-Out Branch: ${displayName} (HEAD)`);
  } else if (refItem.type === 'head') {
    parts.push(`HEAD: ${displayName}`);
  } else if (refItem.type === 'tag') {
    const tagInfo = refItem.tagType ? ` (${refItem.tagType} tag)` : ' (tag)';
    parts.push(`Tag: ${displayName}${tagInfo}`);
  } else if (refItem.type === 'remoteBranch') {
    parts.push(`Remote Branch: ${displayName}`);
  } else {
    parts.push(`Branch: ${displayName}`);
  }

  if (remotes.length > 0) {
    parts.push(`Remote: ${remotes.map((r) => `${r}/${refItem.name}`).join(', ')}`);
  } else if (refItem.upstream) {
    parts.push(`Tracking: ${refItem.upstream}`);
  }

  if (refItem.targetSha) {
    parts.push(`Target: ${refItem.targetSha}`);
  }

  return parts.join(' • ');
}

/**
 * Combines local branches and remote branches that point to the same commit into unified badges.
 */
export function combineLocalAndRemoteRefs(
  refs: RefBadgeItem[],
  showRemoteBranches = true,
  showTags = true,
): RefBadgeItem[] {
  if (!refs || refs.length === 0) {
    return [];
  }

  // Filter based on visibility
  const visibleRefs = refs.filter((ref) => {
    if (ref.type === 'remoteBranch' && !showRemoteBranches) {
      return false;
    }
    if (ref.type === 'tag' && !showTags) {
      return false;
    }
    return true;
  });

  if (!showRemoteBranches) {
    return visibleRefs;
  }

  const localBranches: RefBadgeItem[] = [];
  const remoteBranches: RefBadgeItem[] = [];
  const otherRefs: RefBadgeItem[] = [];

  for (const ref of visibleRefs) {
    if (ref.type === 'localBranch' || ref.type === 'branch') {
      localBranches.push(ref);
    } else if (ref.type === 'remoteBranch') {
      remoteBranches.push(ref);
    } else {
      otherRefs.push(ref);
    }
  }

  const absorbedRemoteIndices = new Set<number>();

  const combinedLocalBranches = localBranches.map((localRef) => {
    const matchedRemotes: string[] = [];

    remoteBranches.forEach((remoteRef, index) => {
      if (absorbedRemoteIndices.has(index)) {
        return;
      }

      let isMatch = false;
      let remoteName = '';

      if (localRef.upstream && localRef.upstream === remoteRef.name) {
        isMatch = true;
        const slashIdx = remoteRef.name.indexOf('/');
        remoteName = slashIdx !== -1 ? remoteRef.name.slice(0, slashIdx) : remoteRef.name;
      } else if (remoteRef.name.endsWith('/' + localRef.name)) {
        isMatch = true;
        remoteName = remoteRef.name.slice(0, -(localRef.name.length + 1));
      } else if (remoteRef.name === localRef.name) {
        isMatch = true;
        remoteName = 'remote';
      }

      if (isMatch) {
        absorbedRemoteIndices.add(index);
        if (remoteName && !matchedRemotes.includes(remoteName)) {
          matchedRemotes.push(remoteName);
        }
      }
    });

    if (matchedRemotes.length > 0) {
      return {
        ...localRef,
        remotes: matchedRemotes,
      };
    }

    return localRef;
  });

  const remainingRemoteBranches = remoteBranches.filter(
    (_, index) => !absorbedRemoteIndices.has(index),
  );

  const combinedAll = [...otherRefs, ...combinedLocalBranches, ...remainingRemoteBranches];

  const order = { head: 1, localBranch: 2, branch: 2, remoteBranch: 3, tag: 4 };
  return combinedAll.sort((a, b) => {
    const orderA = order[a.type] || 5;
    const orderB = order[b.type] || 5;
    if (orderA !== orderB) return orderA - orderB;
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });
}

export const RefBadge: React.FC<RefBadgeProps> = React.memo(
  ({
    refItem,
    originalName,
    className = '',
    style,
    color,
    isCompanion,
    remoteName,
    remotes,
    onClick,
    onDoubleClick,
    onContextMenu,
  }) => {
    const isCurrent = Boolean(refItem.isCurrent);
    const badgeModifier = getBadgeClassModifier(refItem.type);
    const remotesList =
      refItem.remotes && refItem.remotes.length > 0
        ? refItem.remotes
        : remotes && remotes.length > 0
          ? remotes
          : remoteName
            ? [remoteName]
            : [];
    const tooltip = buildRefTooltip(refItem, remotesList);
    const testIdName = originalName || refItem.name;
    const isHead = refItem.type === 'head';
    const isBranchType = refItem.type === 'localBranch' || refItem.type === 'branch';
    const isTag = refItem.type === 'tag';
    const isRemoteBranch = refItem.type === 'remoteBranch';

    // Determine icon background color and badge border color
    let iconBgColor: string | undefined = undefined;
    let badgeBorderColor: string | undefined = undefined;

    if (color) {
      // Unify badge icon and border color with the graph lane/node color
      iconBgColor = color;
      badgeBorderColor = color;
    } else if (isCurrent) {
      iconBgColor = '#007acc';
      badgeBorderColor = '#007acc';
    } else if (isBranchType) {
      iconBgColor = '#007acc';
      badgeBorderColor = 'rgba(255, 255, 255, 0.35)';
    } else if (isTag) {
      iconBgColor = '#d29922';
      badgeBorderColor = 'rgba(210, 153, 34, 0.5)';
    } else if (isRemoteBranch) {
      iconBgColor = '#a371f7';
      badgeBorderColor = 'rgba(163, 113, 247, 0.4)';
    } else if (isHead) {
      iconBgColor = 'rgba(255, 255, 255, 0.3)';
      badgeBorderColor = 'rgba(255, 255, 255, 0.35)';
    }

    const dynamicStyle: React.CSSProperties = {
      ...(badgeBorderColor && !isCompanion
        ? {
            borderColor: badgeBorderColor,
            ['--badge-color' as string]: badgeBorderColor,
          }
        : {}),
      ...style,
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(refItem, e);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDoubleClick?.(refItem, e);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onContextMenu?.(refItem, e);
    };

    return (
      <span className="ref-badge-wrapper">
        <span
          className={`ref-badge ref-tag ${badgeModifier} ${isCurrent ? 'ref-badge-current' : ''} ${isCompanion ? 'ref-badge-companion' : ''} ${refItem.type === 'head' ? 'ref-tag-head' : ''} ${refItem.type === 'tag' ? 'ref-tag-tag' : ''} ${isBranchType ? 'ref-tag-branch' : ''} ${className}`}
          title={tooltip}
          aria-label={tooltip}
          data-testid={`ref-badge-${refItem.type}-${testIdName}`}
          data-ref-type={refItem.type}
          data-is-current={isCurrent ? 'true' : undefined}
          style={dynamicStyle}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              e.preventDefault();
              onDoubleClick?.(refItem, e as unknown as React.MouseEvent);
            }
          }}
        >
          {!isCompanion && (
            <span
              className="ref-badge-icon"
              aria-hidden="true"
              style={iconBgColor ? { backgroundColor: iconBgColor } : undefined}
            >
              <Icon name={getRefIconName(refItem.type)} size={10} />
            </span>
          )}
          <span className="ref-badge-name">{refItem.name}</span>
          {remotesList.length > 0 && (
            <>
              <span className="ref-badge-divider" />
              <span className="ref-badge-remotes" data-testid="ref-badge-remotes">
                {remotesList.join(', ')}
              </span>
            </>
          )}
        </span>
      </span>
    );
  },
);

RefBadge.displayName = 'RefBadge';
