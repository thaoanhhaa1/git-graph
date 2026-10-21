import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { CommitRow, type CommitItem } from './CommitRow';
import { GraphContinuation } from './GraphContinuation';
import type { RefBadgeItem } from '../refs/RefBadge';
import { getGraphWidth, DEFAULT_LANE_WIDTH, DEFAULT_ROW_HEIGHT } from './graphGeometry';
import { useConfigStore } from '../../stores/configStore';
import { useGraphStore } from '../../stores/graphStore';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useRelativeTimeTick } from '../common/dateUtils';
import { useMaxGraphLane } from '../../hooks/useMaxGraphLane';
import { CommitDetailsPanel } from '../details/CommitDetailsPanel';
import {
  loadPersistedState,
  savePersistedState,
  type ColumnWidths,
} from '../../stores/persistence';
import { useDetailsStore, buildDetailsCacheKey } from '../../stores/detailsStore';
import { openDiffInVsCode } from '../../messaging/messageRouter';

export interface CommitListProps {
  commits: CommitItem[];
  repositoryId?: string;
  selectedCommitSha: string | null;
  secondarySelectedCommitSha?: string | null;
  isDetailPanelOpen?: boolean;
  initialFocusChanges?: boolean;
  onCloseDetail?: () => void;
  onStashChanges?: () => void;
  onSelectCommit: (sha: string, e?: React.MouseEvent | React.KeyboardEvent) => void;
  onOpenDetail?: (sha: string) => void;
  onContextMenu?: (
    commit: CommitItem,
    e: React.MouseEvent | React.KeyboardEvent,
    targetRef?: RefBadgeItem,
  ) => void;
  rowHeight?: number;
  overscan?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  loadMoreThreshold?: number; // Number of rows from bottom to trigger loading more
  tableAriaLabel?: string;
  showAuthor?: boolean;
  showDate?: boolean;
  showRemoteBranches?: boolean;
  showTags?: boolean;
  dateType?: 'default' | 'relative' | 'absolute';
  onCheckoutRef?: (ref: RefBadgeItem) => void;
}

export { DEFAULT_ROW_HEIGHT };
export const COMPACT_ROW_HEIGHT = 18;
export const DEFAULT_OVERSCAN = 5;
export const DEFAULT_LOAD_MORE_THRESHOLD_ROWS = 10;
const FALLBACK_VIEWPORT_HEIGHT = 600;
const NOOP = () => {};

export const CommitList: React.FC<CommitListProps> = ({
  commits,
  repositoryId,
  selectedCommitSha,
  secondarySelectedCommitSha,
  isDetailPanelOpen = false,
  initialFocusChanges = false,
  onCloseDetail,
  onStashChanges,
  onSelectCommit,
  onOpenDetail,
  onContextMenu,
  onCheckoutRef,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  loadMoreThreshold = DEFAULT_LOAD_MORE_THRESHOLD_ROWS,
  tableAriaLabel = 'Commit History',
  showAuthor,
  showDate,
  showRemoteBranches,
  showTags,
  dateType,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);
  const lastScrollTopRef = useRef(0);
  const scrollBandRef = useRef(-1);
  const prevRepoIdRef = useRef(repositoryId);
  const prevFirstCommitShaRef = useRef<string | undefined>(commits[0]?.hash);

  // Column width persistence and interactive resizing (M13.4)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    return loadPersistedState()?.columnWidths ?? {};
  });
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;

  const resizingColumnRef = useRef<{
    column: keyof ColumnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeStart = useCallback((column: keyof ColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const thElement = (e.currentTarget as HTMLElement).closest('th');
    const currentWidth =
      columnWidthsRef.current[column] ??
      (thElement ? thElement.getBoundingClientRect().width : 100);

    resizingColumnRef.current = {
      column,
      startX: e.clientX,
      startWidth: currentWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const { column: col, startX, startWidth } = resizingColumnRef.current;
      const delta = moveEvent.clientX - startX;
      let minWidth = 50;
      if (col === 'graph') minWidth = 30;
      else if (col === 'description') minWidth = 80;
      else if (col === 'date') minWidth = 60;
      else if (col === 'author') minWidth = 60;

      const newWidth = Math.max(minWidth, Math.round(startWidth + delta));
      setColumnWidths((prev) => {
        const updated = { ...prev, [col]: newWidth };
        columnWidthsRef.current = updated;
        return updated;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resizingColumnRef.current = null;
      const currentPersisted = loadPersistedState() ?? {};
      savePersistedState({
        ...currentPersisted,
        columnWidths: columnWidthsRef.current,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  const storeSecondarySha = useSelectionStore((s) => s.secondarySelectedCommitSha);
  const selectSecondaryCommit = useSelectionStore((s) => s.selectSecondaryCommit);
  const effectiveSecondarySha =
    secondarySelectedCommitSha !== undefined ? secondarySelectedCommitSha : storeSecondarySha;

  // Handle Esc key and click outside to deselect secondary commit (M11.1)
  useEffect(() => {
    if (!effectiveSecondarySha) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        selectSecondaryCommit(null);
      }
    };

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest('.commit-row') ||
        target.closest('.commit-details-inline-row') ||
        target.closest('.commit-details-panel') ||
        target.closest('.context-menu') ||
        target.closest('.modal-overlay') ||
        target.closest('.modal-container')
      ) {
        return;
      }

      selectSecondaryCommit(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [effectiveSecondarySha, selectSecondaryCommit]);

  const hasBootstrapped = useRepositoryStore((s) => s.hasBootstrapped);
  const isLoading = useGraphStore((s) => s.isLoading);

  // Search matches from store
  const searchMatches = useGraphStore((s) => s.searchMatches);
  const currentMatchIndex = useGraphStore((s) => s.currentMatchIndex);
  const matchedShaSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const currentMatchSha =
    currentMatchIndex >= 0 && currentMatchIndex < searchMatches.length
      ? searchMatches[currentMatchIndex]
      : null;

  // Index maps for O(1) lookups of full / short SHAs
  const commitIndex = useMemo(() => {
    const byHash = new Map<string, number>();
    const byShortHash = new Map<string, number>();
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]!;
      byHash.set(commit.hash, i);
      if (!byShortHash.has(commit.shortHash)) {
        byShortHash.set(commit.shortHash, i);
      }
    }
    return { byHash, byShortHash };
  }, [commits]);

  const findCommitIndex = useCallback(
    (sha: string | null): number => {
      if (!sha) return -1;
      const idx = commitIndex.byHash.get(sha);
      if (idx !== undefined) return idx;
      return commitIndex.byShortHash.get(sha) ?? -1;
    },
    [commitIndex],
  );

  const handleOpenDiffFirstFile = useCallback(
    (sha: string) => {
      const idx = findCommitIndex(sha);
      const commit = idx >= 0 ? commits[idx] : null;
      const fullSha = commit ? commit.hash : sha;
      const detailsState = useDetailsStore.getState();
      const cached =
        detailsState.cache.get(buildDetailsCacheKey(repositoryId ?? '', fullSha)) ??
        (detailsState.details?.sha === fullSha ? detailsState.details : null);

      if (cached && cached.fileChanges && cached.fileChanges.length > 0 && repositoryId) {
        const first = cached.fileChanges[0]!;
        openDiffInVsCode(repositoryId, cached.sha, first.path, cached.parents[0], first.oldPath);
      } else {
        onOpenDetail?.(sha);
      }
    },
    [findCommitIndex, commits, repositoryId, onOpenDetail],
  );

  const handleToggleDetail = useCallback(
    (sha: string) => {
      const isCurrentOpen =
        isDetailPanelOpen &&
        (selectedCommitSha === sha ||
          (selectedCommitSha &&
            (sha.startsWith(selectedCommitSha) || selectedCommitSha.startsWith(sha))));
      if (isCurrentOpen) {
        onCloseDetail?.();
      } else {
        onOpenDetail?.(sha);
      }
    },
    [isDetailPanelOpen, selectedCommitSha, onCloseDetail, onOpenDetail],
  );

  // Scroll to current search match when it changes
  useEffect(() => {
    if (!currentMatchSha || !containerRef.current) return;
    const matchIdx = findCommitIndex(currentMatchSha);
    if (matchIdx >= 0) {
      const rowTop = matchIdx * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const currentScrollTop = containerRef.current.scrollTop;
      const viewport = containerRef.current.clientHeight;
      if (rowTop < currentScrollTop) {
        containerRef.current.scrollTop = rowTop;
      } else if (rowBottom > currentScrollTop + viewport) {
        containerRef.current.scrollTop = rowBottom - viewport;
      }
    }
  }, [currentMatchSha, findCommitIndex, rowHeight]);

  // Read view config from store with optional prop overrides
  const config = useConfigStore((s) => s.config);
  const effectiveShowAuthor = showAuthor ?? config.showAuthor;
  const effectiveShowDate = showDate ?? config.showDate;
  const effectiveShowRemoteBranches = showRemoteBranches ?? config.showRemoteBranches;
  const effectiveShowTags = showTags ?? config.showTags;
  const effectiveDateType = dateType ?? config.dateType;

  // Single shared clock for relative time calculations across all rows (no per-row timers)
  const now = useRelativeTimeTick(60000);

  // Dynamic visible column count
  const totalColumns = 3 + (effectiveShowAuthor ? 1 : 0) + (effectiveShowDate ? 1 : 0);

  // Current selected commit index in the commits list
  const selectedIndex = useMemo(() => {
    if (!selectedCommitSha) return -1;
    return findCommitIndex(selectedCommitSha);
  }, [findCommitIndex, selectedCommitSha]);

  // Update viewport height on mount and window resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const measured = containerRef.current.clientHeight;
        setViewportHeight(measured > 0 ? measured : FALLBACK_VIEWPORT_HEIGHT);
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = entry.contentRect?.height;
          if (h && h > 0) {
            setViewportHeight(h);
          }
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Handle repository switch: reset scroll position to top
  useEffect(() => {
    if (prevRepoIdRef.current !== repositoryId) {
      prevRepoIdRef.current = repositoryId;
      lastScrollTopRef.current = 0;
      scrollBandRef.current = 0;
      setScrollTop(0);
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }
  }, [repositoryId]);

  // Handle commit list changes: preserve scroll position on append, reset on fresh search/branch switch
  useLayoutEffect(() => {
    const currentFirstSha = commits[0]?.hash;
    const isAppended =
      commits.length > 0 &&
      prevFirstCommitShaRef.current !== undefined &&
      prevFirstCommitShaRef.current === currentFirstSha;

    if (isAppended) {
      // Preserve existing scroll position when new items are appended at the bottom
      if (containerRef.current && containerRef.current.scrollTop !== lastScrollTopRef.current) {
        containerRef.current.scrollTop = lastScrollTopRef.current;
      }
    } else if (currentFirstSha !== prevFirstCommitShaRef.current) {
      // Head commit changed completely: reset scroll to top
      prevFirstCommitShaRef.current = currentFirstSha;
      lastScrollTopRef.current = 0;
      scrollBandRef.current = 0;
      setScrollTop(0);
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }
    prevFirstCommitShaRef.current = currentFirstSha;
  }, [commits]);

  // Scroll target commit index into visible viewport when navigated via keyboard
  const scrollToCommitIndex = useCallback(
    (index: number) => {
      if (!containerRef.current || index < 0 || index >= commits.length) return;
      const targetTop = index * rowHeight;
      const currentScrollTop = containerRef.current.scrollTop;
      const effectiveH = viewportHeight > 0 ? viewportHeight : FALLBACK_VIEWPORT_HEIGHT;

      if (targetTop < currentScrollTop) {
        containerRef.current.scrollTop = targetTop;
      } else if (targetTop + rowHeight > currentScrollTop + effectiveH) {
        containerRef.current.scrollTop = targetTop + rowHeight - effectiveH;
      }
    },
    [commits.length, rowHeight, viewportHeight],
  );

  // Accessible keyboard navigation across commits
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (commits.length === 0) return;

      const effectiveH = viewportHeight > 0 ? viewportHeight : FALLBACK_VIEWPORT_HEIGHT;
      const pageSize = Math.max(1, Math.floor(effectiveH / rowHeight));

      let nextIndex = selectedIndex;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          nextIndex = selectedIndex < 0 ? 0 : Math.min(commits.length - 1, selectedIndex + 1);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          nextIndex = selectedIndex < 0 ? 0 : Math.max(0, selectedIndex - 1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < commits.length) {
            const commit = commits[selectedIndex];
            if (commit) {
              handleToggleDetail(commit.shortHash);
            }
          }
          return;
        }
        case ' ': {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < commits.length) {
            const commit = commits[selectedIndex];
            if (commit) {
              handleOpenDiffFirstFile(commit.shortHash);
            }
          }
          return;
        }
        case 'Escape': {
          if (isDetailPanelOpen) {
            e.preventDefault();
            e.stopPropagation();
            onCloseDetail?.();
          }
          return;
        }
        case 'f':
        case 'F': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            }
          }
          return;
        }
        case 'Home': {
          e.preventDefault();
          nextIndex = 0;
          break;
        }
        case 'End': {
          e.preventDefault();
          nextIndex = commits.length - 1;
          break;
        }
        case 'PageDown': {
          e.preventDefault();
          nextIndex =
            selectedIndex < 0
              ? Math.min(commits.length - 1, pageSize)
              : Math.min(commits.length - 1, selectedIndex + pageSize);
          break;
        }
        case 'PageUp': {
          e.preventDefault();
          nextIndex = selectedIndex < 0 ? 0 : Math.max(0, selectedIndex - pageSize);
          break;
        }
        default:
          return;
      }

      if (nextIndex !== selectedIndex && nextIndex >= 0 && nextIndex < commits.length) {
        const commit = commits[nextIndex];
        if (commit) {
          onSelectCommit(commit.shortHash);
          scrollToCommitIndex(nextIndex);
        }
      }
    },
    [
      commits,
      selectedIndex,
      viewportHeight,
      rowHeight,
      onSelectCommit,
      scrollToCommitIndex,
      handleToggleDetail,
      handleOpenDiffFirstFile,
      isDetailPanelOpen,
      onCloseDetail,
    ],
  );

  // Scroll handler with virtual range calculation and infinite load trigger
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const currentScrollTop = target.scrollTop;
      lastScrollTopRef.current = currentScrollTop;

      // Coalesce scroll updates: only flush state when the visible row band changes
      const band = Math.floor(currentScrollTop / rowHeight);
      if (band !== scrollBandRef.current) {
        scrollBandRef.current = band;
        setScrollTop(currentScrollTop);
      }

      // Trigger next page loading when near viewport bottom
      if (hasMore && !isLoadingMore && onLoadMore) {
        const scrollBottom = target.scrollHeight - (currentScrollTop + target.clientHeight);
        const thresholdPx = loadMoreThreshold * rowHeight;
        if (scrollBottom <= thresholdPx) {
          onLoadMore();
        }
      }
    },
    [hasMore, isLoadingMore, onLoadMore, loadMoreThreshold, rowHeight],
  );

  // Virtualization window slice calculation
  const effectiveViewportHeight = viewportHeight > 0 ? viewportHeight : FALLBACK_VIEWPORT_HEIGHT;
  const totalCount = commits.length;

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + effectiveViewportHeight) / rowHeight) + overscan,
  );

  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * rowHeight);
  const visibleCommits = commits.slice(startIndex, endIndex);

  // Track the widest lane incrementally so page appends stay O(new rows)
  const maxGraphLane = useMaxGraphLane(commits);

  const graphColWidth = useMemo(() => {
    return getGraphWidth(maxGraphLane, DEFAULT_LANE_WIDTH);
  }, [maxGraphLane]);

  return (
    <div
      className="commit-table-container"
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-testid="commit-table-container"
      role="region"
      aria-label={tableAriaLabel}
    >
      <table className="commit-table" aria-label={tableAriaLabel} role="grid">
        <thead>
          <tr role="row">
            <th
              role="columnheader"
              className="commit-col-graph"
              style={{
                width: columnWidths.graph ?? graphColWidth,
                minWidth: columnWidths.graph ?? graphColWidth,
                textAlign: 'left',
                position: 'relative',
              }}
            >
              Graph
              <div
                className="column-resize-handle"
                data-testid="resize-handle-graph"
                aria-label="Resize Graph Column"
                onMouseDown={(e) => handleResizeStart('graph', e)}
              />
            </th>
            <th
              role="columnheader"
              className="commit-col-description"
              style={{
                width: columnWidths.description,
                minWidth: columnWidths.description ?? 0,
                position: 'relative',
              }}
            >
              Description
              <div
                className="column-resize-handle"
                data-testid="resize-handle-description"
                aria-label="Resize Description Column"
                onMouseDown={(e) => handleResizeStart('description', e)}
              />
            </th>
            {effectiveShowDate && (
              <th
                role="columnheader"
                className="commit-col-date"
                style={{
                  width: columnWidths.date ?? 130,
                  minWidth: columnWidths.date ?? 130,
                  position: 'relative',
                }}
              >
                Date
                <div
                  className="column-resize-handle"
                  data-testid="resize-handle-date"
                  aria-label="Resize Date Column"
                  onMouseDown={(e) => handleResizeStart('date', e)}
                />
              </th>
            )}
            {effectiveShowAuthor && (
              <th
                role="columnheader"
                className="commit-col-author"
                style={{
                  width: columnWidths.author ?? 120,
                  minWidth: columnWidths.author ?? 120,
                  position: 'relative',
                }}
              >
                Author
                <div
                  className="column-resize-handle"
                  data-testid="resize-handle-author"
                  aria-label="Resize Author Column"
                  onMouseDown={(e) => handleResizeStart('author', e)}
                />
              </th>
            )}
            <th
              role="columnheader"
              className="commit-col-commit"
              style={{
                width: columnWidths.commit ?? 90,
                minWidth: columnWidths.commit ?? 90,
                position: 'relative',
              }}
            >
              Commit
              <div
                className="column-resize-handle"
                data-testid="resize-handle-commit"
                aria-label="Resize Commit Column"
                onMouseDown={(e) => handleResizeStart('commit', e)}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {commits.length === 0 ? (
            isLoading || !hasBootstrapped ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <tr
                  key={`skeleton-${idx}`}
                  className="commit-row commit-skeleton-row"
                  aria-hidden="true"
                  data-testid="commit-skeleton-row"
                >
                  <td
                    className="commit-cell commit-cell-graph"
                    style={{
                      width: columnWidths.graph ?? graphColWidth,
                      minWidth: columnWidths.graph ?? graphColWidth,
                    }}
                  >
                    <div
                      className="commit-skeleton-item"
                      style={{ width: 12, height: 12, borderRadius: '50%', marginLeft: 10 }}
                    />
                  </td>
                  <td
                    className="commit-cell"
                    style={
                      columnWidths.description
                        ? {
                            width: columnWidths.description,
                            minWidth: columnWidths.description,
                          }
                        : undefined
                    }
                  >
                    <div
                      className="commit-skeleton-item"
                      style={{ width: `${Math.max(30, Math.sin(idx + 1) * 30 + 55)}%` }}
                    />
                  </td>
                  {effectiveShowDate && (
                    <td
                      className="commit-cell commit-cell-date"
                      style={{
                        width: columnWidths.date ?? 130,
                        minWidth: columnWidths.date ?? 130,
                      }}
                    >
                      <div className="commit-skeleton-item" style={{ width: 75 }} />
                    </td>
                  )}
                  {effectiveShowAuthor && (
                    <td
                      className="commit-cell commit-cell-author"
                      style={{
                        width: columnWidths.author ?? 120,
                        minWidth: columnWidths.author ?? 120,
                      }}
                    >
                      <div className="commit-skeleton-item" style={{ width: 70 }} />
                    </td>
                  )}
                  <td
                    className="commit-cell commit-cell-hash"
                    style={{
                      width: columnWidths.commit ?? 90,
                      minWidth: columnWidths.commit ?? 90,
                    }}
                  >
                    <div className="commit-skeleton-item" style={{ width: 55 }} />
                  </td>
                </tr>
              ))
            ) : (
              <tr className="commit-empty-row" data-testid="commit-empty-row">
                <td
                  colSpan={totalColumns}
                  style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: 'var(--color-fg-muted)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  No commits found in this repository.
                </td>
              </tr>
            )
          ) : (
            <>
              {/* Top Virtual Spacer Row */}
              {topSpacerHeight > 0 && (
                <tr
                  className="commit-spacer-row commit-spacer-top"
                  style={{ height: `${topSpacerHeight}px` }}
                  aria-hidden="true"
                  data-testid="commit-spacer-top"
                >
                  <td colSpan={totalColumns} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}

              {/* Visible Commit Rows — Keyed by repository context + commit SHA */}
              {visibleCommits.map((commit, index) => {
                const actualIndex = startIndex + index;
                const previousCommit = actualIndex > 0 ? commits[actualIndex - 1] : undefined;
                const previousGraphRow = previousCommit?.graphRow;
                const isSelected =
                  selectedCommitSha === commit.shortHash || selectedCommitSha === commit.hash;
                const isSecondarySelected =
                  Boolean(effectiveSecondarySha) &&
                  (effectiveSecondarySha === commit.shortHash ||
                    effectiveSecondarySha === commit.hash);
                const isTabCandidate = actualIndex === (selectedIndex >= 0 ? selectedIndex : 0);
                const itemKey = `${repositoryId ?? 'repo'}:${commit.hash}`;

                const isMatched =
                  matchedShaSet.has(commit.hash) || matchedShaSet.has(commit.shortHash);
                const isCurrentMatch =
                  currentMatchSha === commit.hash || currentMatchSha === commit.shortHash;

                const showInlineDetails =
                  isDetailPanelOpen &&
                  (isSelected ||
                    (selectedCommitSha &&
                      (commit.hash.startsWith(selectedCommitSha) ||
                        selectedCommitSha.startsWith(commit.shortHash))));

                return (
                  <React.Fragment key={itemKey}>
                    <CommitRow
                      commit={commit}
                      isSelected={isSelected}
                      isSecondarySelected={isSecondarySelected}
                      onSelect={onSelectCommit}
                      onOpenDetail={onOpenDetail}
                      onToggleDetail={handleToggleDetail}
                      onOpenDiffFirstFile={handleOpenDiffFirstFile}
                      onContextMenu={onContextMenu}
                      tabIndex={isTabCandidate ? 0 : -1}
                      repositoryId={repositoryId}
                      rowHeight={rowHeight}
                      previousGraphRow={previousGraphRow}
                      maxGraphLane={maxGraphLane}
                      graphColWidth={columnWidths.graph ?? graphColWidth}
                      descriptionColWidth={columnWidths.description}
                      dateColWidth={columnWidths.date ?? 130}
                      authorColWidth={columnWidths.author ?? 120}
                      commitColWidth={columnWidths.commit ?? 90}
                      showAuthor={effectiveShowAuthor}
                      showDate={effectiveShowDate}
                      showRemoteBranches={effectiveShowRemoteBranches}
                      showTags={effectiveShowTags}
                      dateType={effectiveDateType}
                      now={now}
                      isMatched={isMatched}
                      isCurrentMatch={isCurrentMatch}
                      onCheckoutRef={onCheckoutRef}
                    />
                    {showInlineDetails && (
                      <tr
                        className="commit-details-inline-row"
                        key={`${itemKey}-details-row`}
                        data-testid="commit-details-inline-row"
                      >
                        <td
                          className="commit-cell commit-cell-graph commit-details-graph-cell"
                          style={{
                            width: columnWidths.graph ?? graphColWidth,
                            minWidth: columnWidths.graph ?? graphColWidth,
                            maxWidth: columnWidths.graph ?? graphColWidth,
                            padding: 0,
                            verticalAlign: 'top',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              right: 0,
                              width: `${columnWidths.graph ?? graphColWidth}px`,
                              overflow: 'hidden',
                            }}
                          >
                            <svg
                              className="graph-cell-svg graph-details-continuation-svg"
                              width={columnWidths.graph ?? graphColWidth}
                              height="100%"
                              style={{
                                display: 'block',
                                width: `${columnWidths.graph ?? graphColWidth}px`,
                                height: '100%',
                              }}
                              role="presentation"
                              aria-hidden="true"
                            >
                              {commit.graphRow ? <GraphContinuation row={commit.graphRow} /> : null}
                            </svg>
                          </div>
                        </td>
                        <td
                          colSpan={totalColumns - 1}
                          className="commit-details-inline-cell"
                          style={{ padding: 0, border: 'none' }}
                        >
                          <CommitDetailsPanel
                            repositoryId={repositoryId}
                            selectedSha={commit.hash}
                            secondarySha={effectiveSecondarySha}
                            initialFocusChanges={initialFocusChanges}
                            onClose={onCloseDetail ?? NOOP}
                            onSelectCommit={onSelectCommit}
                            onStash={onStashChanges}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Bottom Virtual Spacer Row */}
              {bottomSpacerHeight > 0 && (
                <tr
                  className="commit-spacer-row commit-spacer-bottom"
                  style={{ height: `${bottomSpacerHeight}px` }}
                  aria-hidden="true"
                  data-testid="commit-spacer-bottom"
                >
                  <td colSpan={totalColumns} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
            </>
          )}

          {/* Loading more indicator row */}
          {isLoadingMore && (
            <tr className="commit-loading-row" data-testid="commit-loading-row" aria-live="polite">
              <td
                colSpan={totalColumns}
                style={{
                  textAlign: 'center',
                  padding: '8px',
                  color: 'var(--color-fg-muted)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <span className="loading-spinner" style={{ marginRight: 8 }} />
                Loading more commits...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
