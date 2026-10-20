import React, { useCallback, useMemo } from 'react';
import type { GraphRow } from '@git-graph/git-graph';
import { GraphCell } from './GraphCell';
import { CommitMetadata } from './CommitMetadata';
import type { RefBadgeItem, RefBadgeType } from '../refs/RefBadge';
import {
  formatRelativeDate,
  formatAbsoluteDate,
  formatGitGraphDate,
  formatTooltipDate,
} from '../common/dateUtils';
import { getLaneColor } from './graphGeometry';

export type CommitRefType = RefBadgeType;

export type CommitRefTag = RefBadgeItem;

export interface CommitItem {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  timestamp?: number;
  refs?: CommitRefTag[];
  graphRow?: GraphRow;
  isHead?: boolean;
  parents?: string[];
  body?: string;
}

export interface CommitRowProps {
  commit: CommitItem;
  isSelected: boolean;
  isSecondarySelected?: boolean;
  onSelect: (sha: string, e?: React.MouseEvent | React.KeyboardEvent) => void;
  onOpenDetail?: (sha: string) => void;
  onContextMenu?: (
    commit: CommitItem,
    e: React.MouseEvent | React.KeyboardEvent,
    targetRef?: RefBadgeItem,
  ) => void;
  tabIndex?: number;
  repositoryId?: string;
  rowHeight?: number;
  style?: React.CSSProperties;
  previousGraphRow?: GraphRow;
  maxGraphLane?: number;
  graphColWidth?: number;
  showAuthor?: boolean;
  showDate?: boolean;
  showRemoteBranches?: boolean;
  showTags?: boolean;
  dateColWidth?: number;
  authorColWidth?: number;
  commitColWidth?: number;
  descriptionColWidth?: number;
  dateType?: 'default' | 'relative' | 'absolute';
  now?: number;
  isMatched?: boolean;
  isCurrentMatch?: boolean;
  onCheckoutRef?: (ref: RefBadgeItem) => void;
  onToggleDetail?: (sha: string) => void;
  onOpenDiffFirstFile?: (sha: string) => void;
}

export const CommitRow: React.FC<CommitRowProps> = React.memo(
  ({
    commit,
    isSelected,
    isSecondarySelected = false,
    onSelect,
    onOpenDetail,
    onToggleDetail,
    onOpenDiffFirstFile,
    onContextMenu,
    onCheckoutRef,
    tabIndex,
    rowHeight,
    style,
    previousGraphRow,
    maxGraphLane,
    graphColWidth,
    showAuthor = true,
    showDate = true,
    showRemoteBranches = true,
    showTags = true,
    dateColWidth,
    authorColWidth,
    commitColWidth,
    descriptionColWidth,
    dateType,
    now,
    isMatched = false,
    isCurrentMatch = false,
  }) => {
    const rowStyle: React.CSSProperties = {
      height: rowHeight ? `${rowHeight}px` : undefined,
      ...style,
    };

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect(commit.shortHash, e);
        } else {
          onSelect(commit.shortHash);
        }
      },
      [onSelect, commit.shortHash],
    );

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect(commit.shortHash, e);
        } else {
          onSelect(commit.shortHash);
        }
        onOpenDetail?.(commit.shortHash);
      },
      [onSelect, onOpenDetail, commit.shortHash],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTableRowElement>) => {
        const isMulti = e.ctrlKey || e.metaKey;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (isMulti) {
            onSelect(commit.shortHash, e);
          } else {
            onSelect(commit.shortHash);
          }
          if (onToggleDetail) {
            onToggleDetail(commit.shortHash);
          } else {
            onOpenDetail?.(commit.shortHash);
          }
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          e.stopPropagation();
          if (isMulti) {
            onSelect(commit.shortHash, e);
          } else {
            onSelect(commit.shortHash);
          }
          onOpenDiffFirstFile?.(commit.shortHash);
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(commit, e);
        }
      },
      [onSelect, onOpenDetail, onToggleDetail, onOpenDiffFirstFile, onContextMenu, commit],
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent<HTMLTableRowElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(commit, e);
      },
      [onContextMenu, commit],
    );

    const handleContextMenuRef = useCallback(
      (refItem: RefBadgeItem, e: React.MouseEvent) => {
        onContextMenu?.(commit, e, refItem);
      },
      [onContextMenu, commit],
    );

    const isHead =
      commit.isHead ?? commit.refs?.some((r) => r.type === 'head' || r.name === 'HEAD');

    const isUncommitted = commit.hash === '*' || commit.shortHash === '*';

    const nodeColor = useMemo(() => {
      if (isUncommitted) {
        return 'var(--color-fg-muted, #a0a0a0)';
      }
      const nodeSegment = commit.graphRow?.segments.find(
        (s) => s.fromLane === commit.graphRow?.lane && s.kind !== 'pass-through',
      );
      const nodeColorIndex = nodeSegment ? nodeSegment.colorIndex : (commit.graphRow?.lane ?? 0);
      return getLaneColor(nodeColorIndex);
    }, [commit.graphRow, isUncommitted]);

    const displayDate = useMemo(() => {
      if (dateType === 'relative' && commit.timestamp) {
        return formatRelativeDate(commit.timestamp, now);
      }
      if (dateType === 'absolute' && commit.timestamp) {
        return formatAbsoluteDate(commit.timestamp);
      }
      if (commit.timestamp) {
        return formatGitGraphDate(commit.timestamp);
      }
      return commit.date;
    }, [commit.date, commit.timestamp, dateType, now]);

    const dateTooltip = useMemo(() => {
      if (commit.timestamp) {
        return formatTooltipDate(commit.timestamp);
      }
      return commit.date;
    }, [commit.date, commit.timestamp]);

    const commitSummary = useMemo(() => {
      return `Commit ${commit.shortHash}: ${commit.message} by ${commit.author}, ${displayDate}`;
    }, [commit.shortHash, commit.message, commit.author, displayDate]);

    return (
      <tr
        className={`commit-row ${isSelected ? 'selected' : ''} ${isSecondarySelected ? 'secondary-selected' : ''} ${isMatched ? 'search-match' : ''} ${isCurrentMatch ? 'current-match' : ''} ${isUncommitted ? 'commit-row-uncommitted' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        tabIndex={tabIndex ?? (isSelected ? 0 : -1)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        data-testid={`commit-row-${commit.shortHash}`}
        style={rowStyle}
        role="row"
        aria-selected={isSelected}
        aria-label={commitSummary}
      >
        {/* 1. Graph */}
        <td
          className="commit-cell commit-cell-graph"
          role="gridcell"
          style={graphColWidth ? { width: graphColWidth, minWidth: graphColWidth } : undefined}
        >
          {commit.graphRow ? (
            <GraphCell
              row={commit.graphRow}
              previousRow={previousGraphRow}
              rowHeight={rowHeight}
              maxGraphLane={maxGraphLane}
              isHead={isHead}
              isSelected={isSelected}
              isUncommitted={isUncommitted}
            />
          ) : (
            <span className="graph-dot" />
          )}
        </td>

        {/* 2. Description */}
        <td
          className="commit-cell commit-cell-message"
          role="gridcell"
          style={
            descriptionColWidth
              ? { width: descriptionColWidth, maxWidth: descriptionColWidth }
              : undefined
          }
        >
          <CommitMetadata
            message={commit.message}
            refs={commit.refs}
            showRemoteBranches={showRemoteBranches}
            showTags={showTags}
            badgeColor={nodeColor}
            isUncommitted={isUncommitted}
            onCheckoutRef={onCheckoutRef}
            onContextMenuRef={handleContextMenuRef}
          />
        </td>

        {/* 3. Date */}
        {showDate && (
          <td
            className="commit-cell commit-cell-date"
            role="gridcell"
            style={
              dateColWidth
                ? { width: dateColWidth, minWidth: dateColWidth, maxWidth: dateColWidth }
                : undefined
            }
            title={dateTooltip}
            aria-label={`Date: ${displayDate}`}
          >
            {displayDate}
          </td>
        )}

        {/* 4. Author */}
        {showAuthor && (
          <td
            className="commit-cell commit-cell-author"
            role="gridcell"
            style={
              authorColWidth
                ? { width: authorColWidth, minWidth: authorColWidth, maxWidth: authorColWidth }
                : undefined
            }
            title={`Author: ${commit.author}`}
            aria-label={`Author: ${commit.author}`}
          >
            <span className="commit-author-text">{commit.author}</span>
          </td>
        )}

        {/* 5. Commit */}
        <td
          className="commit-cell commit-cell-hash"
          role="gridcell"
          style={
            commitColWidth
              ? { width: commitColWidth, minWidth: commitColWidth, maxWidth: commitColWidth }
              : undefined
          }
          title={`Commit SHA: ${commit.hash}`}
          aria-label={`Commit hash: ${commit.shortHash}`}
        >
          {commit.shortHash}
        </td>
      </tr>
    );
  },
);

CommitRow.displayName = 'CommitRow';
