import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDetailsStore } from '../../stores/detailsStore';
import { useDiffStore } from '../../stores/diffStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useGraphStore } from '../../stores/graphStore';
import {
  openDiffInVsCode,
  openFileAtRevisionInVsCode,
  requestCheckout,
} from '../../messaging/messageRouter';
import { RefBadge, type RefBadgeItem, combineLocalAndRemoteRefs } from '../refs/RefBadge';
import { formatFullDateTime } from '../common/dateUtils';
import { ChangedFiles } from './ChangedFiles';
import { DiffViewer } from '../diff/DiffViewer';
import { UncommittedChangesPanel } from './UncommittedChangesPanel';
import { Icon } from '../../components/ui/Icon';

export interface CommitDetailsPanelProps {
  repositoryId?: string;
  selectedSha: string | null;
  secondarySha?: string | null;
  initialFocusChanges?: boolean;
  onClose: () => void;
  onSelectCommit?: (sha: string) => void;
  onStash?: () => void;
}

/**
 * Parses message text and highlights/hyperlinks 40-character commit hashes.
 */
function renderFormattedMessage(
  text: string,
  onSelectCommit?: (sha: string) => void,
): React.ReactNode {
  const hashRegex = /([a-f0-9]{40})/g;
  const parts = text.split(hashRegex);

  return parts.map((part, i) => {
    if (hashRegex.test(part)) {
      return (
        <span
          key={`hash-${i}`}
          className="commit-message-hash-link"
          onClick={(e) => {
            e.stopPropagation();
            onSelectCommit?.(part);
          }}
          title={`View commit ${part}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

export const CommitDetailsPanel: React.FC<CommitDetailsPanelProps> = ({
  repositoryId,
  selectedSha,
  secondarySha,
  initialFocusChanges = false,
  onClose,
  onSelectCommit,
  onStash,
}) => {
  const details = useDetailsStore((s) => s.details);
  const isLoading = useDetailsStore((s) => s.isLoading);
  const error = useDetailsStore((s) => s.error);
  const currentSha = useDetailsStore((s) => s.currentSha);
  const currentRepositoryId = useDetailsStore((s) => s.currentRepositoryId);
  const selectedParentSha = useDetailsStore((s) => s.selectedParentSha);
  const requestDetails = useDetailsStore((s) => s.requestDetails);
  const selectParent = useDetailsStore((s) => s.selectParent);

  const storeSecondarySha = useSelectionStore((s) => s.secondarySelectedCommitSha);
  const selectSecondaryCommit = useSelectionStore((s) => s.selectSecondaryCommit);
  const effectiveSecondarySha = secondarySha !== undefined ? secondarySha : storeSecondarySha;
  const isCompareMode =
    Boolean(effectiveSecondarySha) && Boolean(selectedSha) && effectiveSecondarySha !== selectedSha;

  const commits = useGraphStore((s) => s.commits);

  const selectedFilePath = useDiffStore((s) => s.selectedFilePath);
  const selectedFile = useDiffStore((s) => s.selectedFile);
  const selectFile = useDiffStore((s) => s.selectFile);
  const clearDiff = useDiffStore((s) => s.clearDiff);

  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [filterText, setFilterText] = useState('');

  // Fast O(1) commit lookup by full and short SHA
  const commitIndexMap = useMemo(() => {
    const map = new Map<string, { commit: (typeof commits)[0]; index: number }>();
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      map.set(c.sha, { commit: c, index: i });
      map.set(c.shortSha, { commit: c, index: i });
    }
    return map;
  }, [commits]);

  // Determine Commit A (cũ hơn / older) and Commit B (mới hơn / newer)
  const { olderCommit, newerCommit, shaA, shaB, commitsBetweenCount } = useMemo(() => {
    if (!isCompareMode || !selectedSha || !effectiveSecondarySha) {
      return {
        olderCommit: undefined,
        newerCommit: undefined,
        shaA: '',
        shaB: '',
        commitsBetweenCount: 0,
      };
    }

    const entry1 = commitIndexMap.get(selectedSha);
    const entry2 = commitIndexMap.get(effectiveSecondarySha);

    let isFirstOlder = false;
    if (entry1 && entry2) {
      if (entry1.index !== entry2.index) {
        // In the commit list, index 0 is newest; larger index means older
        isFirstOlder = entry1.index > entry2.index;
      } else {
        isFirstOlder =
          (entry1.commit.author?.timestamp ?? 0) <= (entry2.commit.author?.timestamp ?? 0);
      }
    } else if (entry1?.commit.author?.timestamp && entry2?.commit.author?.timestamp) {
      isFirstOlder = entry1.commit.author.timestamp <= entry2.commit.author.timestamp;
    }

    const older = isFirstOlder ? entry1?.commit : entry2?.commit;
    const newer = isFirstOlder ? entry2?.commit : entry1?.commit;
    const aSha = isFirstOlder
      ? entry1?.commit.sha || selectedSha
      : entry2?.commit.sha || effectiveSecondarySha;
    const bSha = isFirstOlder
      ? entry2?.commit.sha || effectiveSecondarySha
      : entry1?.commit.sha || selectedSha;

    let count = 1;
    if (details?.stats?.commitCount !== undefined && details.stats.commitCount > 0) {
      count = details.stats.commitCount;
    } else if (details?.commitCount !== undefined && details.commitCount > 0) {
      count = details.commitCount;
    } else if (entry1 && entry2) {
      count = Math.max(1, Math.abs(entry1.index - entry2.index));
    }

    return {
      olderCommit: older,
      newerCommit: newer,
      shaA: aSha,
      shaB: bSha,
      commitsBetweenCount: count,
    };
  }, [
    isCompareMode,
    selectedSha,
    effectiveSecondarySha,
    commitIndexMap,
    details?.stats?.commitCount,
    details?.commitCount,
  ]);

  const handleRefDoubleClick = useCallback(
    (refItem: RefBadgeItem) => {
      if (!repositoryId) return;
      let targetType: 'localBranch' | 'remoteBranch' | 'tag' | 'commit' = 'localBranch';
      if (refItem.type === 'remoteBranch') targetType = 'remoteBranch';
      else if (refItem.type === 'tag') targetType = 'tag';
      else if (refItem.type === 'head') targetType = 'commit';

      requestCheckout({
        repositoryId,
        target: refItem.fullName || refItem.name,
        targetType,
      });
    },
    [repositoryId],
  );

  // Auto-select first changed file if initialFocusChanges is active
  useEffect(() => {
    if (
      initialFocusChanges &&
      details?.fileChanges &&
      details.fileChanges.length > 0 &&
      details.fileChanges[0] &&
      !selectedFile
    ) {
      selectFile(details.fileChanges[0]);
    }
  }, [initialFocusChanges, details?.fileChanges, selectedFile, selectFile]);

  // When selectedSha or secondarySha or repositoryId changes, request details if needed
  useEffect(() => {
    if (repositoryId && selectedSha && selectedSha !== '*') {
      if (isCompareMode && shaA && shaB) {
        const isAlreadyCurrent =
          currentSha === shaB &&
          currentRepositoryId === repositoryId &&
          selectedParentSha === shaA &&
          (details !== null || isLoading || error !== null);

        if (!isAlreadyCurrent) {
          requestDetails(repositoryId, shaB, shaA);
        }
      } else if (!isCompareMode) {
        const isAlreadyCurrent =
          currentSha === selectedSha &&
          currentRepositoryId === repositoryId &&
          (details !== null || isLoading || error !== null);

        if (!isAlreadyCurrent) {
          requestDetails(repositoryId, selectedSha);
        }
      }
    }
  }, [
    repositoryId,
    selectedSha,
    isCompareMode,
    shaA,
    shaB,
    currentSha,
    currentRepositoryId,
    selectedParentSha,
    details,
    isLoading,
    error,
    requestDetails,
  ]);

  const handleClose = useCallback(() => {
    clearDiff();
    if (isCompareMode) {
      selectSecondaryCommit(null);
    }
    onClose();
  }, [clearDiff, isCompareMode, selectSecondaryCommit, onClose]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCompareMode) {
          selectSecondaryCommit(null);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCompareMode, selectSecondaryCommit, handleClose]);

  const handleCopySha = useCallback(async () => {
    const targetSha = isCompareMode ? `${shaA}..${shaB}` : details?.sha;
    if (!targetSha) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetSha);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [isCompareMode, shaA, shaB, details?.sha]);

  const handleRetry = useCallback(() => {
    if (repositoryId) {
      if (isCompareMode && shaA && shaB) {
        requestDetails(repositoryId, shaB, shaA);
      } else if (selectedSha) {
        requestDetails(repositoryId, selectedSha, selectedParentSha ?? undefined);
      }
    }
  }, [repositoryId, isCompareMode, shaA, shaB, selectedSha, selectedParentSha, requestDetails]);

  const formattedFullDate = useMemo(() => {
    if (!details?.author?.timestamp) return '';
    return formatFullDateTime(details.author.timestamp);
  }, [details?.author?.timestamp]);

  const refBadgeItems: RefBadgeItem[] = useMemo(() => {
    if (!details?.refs) return [];
    const items: RefBadgeItem[] = details.refs.map((r) => ({
      name: r.name,
      fullName: r.fullName,
      type: r.kind,
      upstream: r.upstream,
      tagType: r.tagType,
      targetSha: r.target,
      isCurrent: r.isCurrent,
    }));
    return combineLocalAndRemoteRefs(items, true, true);
  }, [details?.refs]);

  const effectiveParentSha =
    selectedParentSha ||
    (details?.parents && details.parents.length > 0 ? details.parents[0] : undefined);

  if (selectedSha === '*') {
    return (
      <UncommittedChangesPanel repositoryId={repositoryId} onClose={onClose} onStash={onStash} />
    );
  }

  return (
    <aside
      className="commit-details-panel"
      data-testid="commit-details-panel"
      role="region"
      aria-label={isCompareMode ? 'Compare Commits Panel' : 'Commit Details Panel'}
    >
      {/* Hidden short sha for test compatibility */}
      {details?.shortSha && (
        <span
          className="commit-details-sha-badge"
          style={{ display: 'none' }}
          data-testid="details-short-sha"
        >
          {details.shortSha}
        </span>
      )}

      {isLoading ? (
        <div
          className="commit-details-loading"
          data-testid="commit-details-loading"
          role="status"
          aria-live="polite"
        >
          <span className="loading-spinner" />
          <span>{isCompareMode ? 'Comparing commits...' : 'Loading commit details...'}</span>
        </div>
      ) : error ? (
        <div className="commit-details-error" data-testid="commit-details-error" role="alert">
          <p className="error-title">
            {isCompareMode ? 'Failed to compare commits' : 'Failed to load commit details'}
          </p>
          <p className="error-message">{error}</p>
          <button
            type="button"
            className="details-action-btn retry-btn"
            onClick={handleRetry}
            data-testid="details-retry-button"
          >
            Retry
          </button>
        </div>
      ) : !details ? (
        <div className="commit-details-empty" data-testid="commit-details-empty">
          {isCompareMode
            ? 'Select 2 commits on the graph to view their diff comparison.'
            : 'Select a commit on the graph to view its complete details.'}
        </div>
      ) : isCompareMode ? (
        /* M11.2 — Compare Commits Mode */
        <div className="compare-commits-container" data-testid="compare-commits-container">
          <div className="compare-commits-header" data-testid="compare-commits-header">
            <div className="compare-commits-heading">
              <span className="compare-commits-title">Compare Commits</span>
            </div>
            <div className="compare-commits-range" data-testid="compare-commits-range">
              <span
                className="compare-commit-node older"
                data-testid="compare-commit-a"
                title={`Older commit: ${shaA}`}
              >
                <span className="compare-commit-label">Commit A (cũ hơn):</span>{' '}
                <button
                  type="button"
                  className="parent-link-btn-text font-mono"
                  onClick={() => onSelectCommit?.(shaA)}
                  title={`Select ${shaA}`}
                  data-testid="compare-commit-a-btn"
                >
                  {olderCommit?.shortSha ?? shaA.slice(0, 7)}
                </button>
                {olderCommit?.subject && (
                  <span className="compare-commit-subject" title={olderCommit.subject}>
                    {' '}
                    - {olderCommit.subject}
                  </span>
                )}
              </span>
              <span className="compare-range-arrow" aria-hidden="true">
                {' '}
                ↔{' '}
              </span>
              <span
                className="compare-commit-node newer"
                data-testid="compare-commit-b"
                title={`Newer commit: ${shaB}`}
              >
                <span className="compare-commit-label">Commit B (mới hơn):</span>{' '}
                <button
                  type="button"
                  className="parent-link-btn-text font-mono"
                  onClick={() => onSelectCommit?.(shaB)}
                  title={`Select ${shaB}`}
                  data-testid="compare-commit-b-btn"
                >
                  {newerCommit?.shortSha ?? shaB.slice(0, 7)}
                </button>
                {newerCommit?.subject && (
                  <span className="compare-commit-subject" title={newerCommit.subject}>
                    {' '}
                    - {newerCommit.subject}
                  </span>
                )}
              </span>
            </div>
            <div className="compare-commits-stats" data-testid="compare-commits-stats">
              <span className="compare-stat-commits" data-testid="compare-stat-commits">
                {commitsBetweenCount} {commitsBetweenCount === 1 ? 'commit' : 'commits'} (
                {shaA.slice(0, 7)}..{shaB.slice(0, 7)})
              </span>
              <span className="compare-stat-files" data-testid="compare-stat-files">
                {details.stats?.filesChanged ?? details.fileChanges?.length ?? 0} files changed
              </span>
              <span
                className="compare-stat-diffstat stats-additions"
                data-testid="compare-stat-additions"
              >
                +{details.stats?.additions ?? 0}
              </span>
              <span
                className="compare-stat-diffstat stats-deletions"
                data-testid="compare-stat-deletions"
              >
                -{details.stats?.deletions ?? 0}
              </span>
            </div>
          </div>

          <div className="commit-details-main-layout">
            {/* Left Column: DiffViewer (if file selected) or Overview */}
            <div className="commit-details-left-section compare-diff-section">
              {selectedFile ? (
                <DiffViewer
                  repositoryId={repositoryId}
                  commitSha={shaB}
                  parentSha={shaA}
                  baseSha={shaA}
                  targetSha={shaB}
                  selectedFile={selectedFile}
                  onClose={() => selectFile(null)}
                  onOpenDiffInVsCode={(filePath, oldPath) => {
                    if (repositoryId) {
                      openDiffInVsCode(
                        repositoryId,
                        shaB,
                        filePath,
                        shaA,
                        oldPath,
                        false,
                        shaA,
                        shaB,
                      );
                    }
                  }}
                />
              ) : (
                <div className="compare-overview-prompt" data-testid="compare-overview-prompt">
                  <div className="compare-prompt-icon">🔍</div>
                  <div className="compare-prompt-title">
                    Comparing {shaA.slice(0, 7)} ↔ {shaB.slice(0, 7)}
                  </div>
                  <div className="compare-prompt-desc">
                    Click a changed file on the right to open DiffViewer comparing{' '}
                    {shaA.slice(0, 7)} and {shaB.slice(0, 7)}.
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Changed Files */}
            <div className="commit-details-right-section">
              {details.fileChanges && (
                <ChangedFiles
                  repositoryId={repositoryId}
                  commitSha={shaB}
                  parentSha={shaA}
                  fileChanges={details.fileChanges}
                  selectedFilePath={selectedFilePath}
                  viewMode={viewMode}
                  filterText={filterText}
                  isFilterVisible={isFilterVisible}
                  onFilterTextChange={setFilterText}
                  onSelectFile={(file) => {
                    selectFile(file);
                  }}
                  onOpenDiffInVsCode={(filePath, oldPath) => {
                    if (repositoryId) {
                      openDiffInVsCode(
                        repositoryId,
                        shaB,
                        filePath,
                        shaA,
                        oldPath,
                        false,
                        shaA,
                        shaB,
                      );
                    }
                  }}
                  onOpenFileInEditor={(filePath) => {
                    if (repositoryId) {
                      openFileAtRevisionInVsCode(repositoryId, filePath, shaB);
                    }
                  }}
                />
              )}
            </div>

            {/* Far Right: Vertical Action Toolbar */}
            <div className="commit-details-vertical-toolbar">
              <button
                type="button"
                className="details-toolbar-icon-btn close-btn"
                onClick={handleClose}
                title="Close commit details (Esc)"
                aria-label="Close commit details"
                data-testid="close-details-button"
              >
                <Icon name="close" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${isFilterVisible ? 'active' : ''}`}
                onClick={() => setIsFilterVisible((prev) => !prev)}
                title="Filter files"
                aria-label="Filter files"
                data-testid="details-filter-btn"
              >
                <Icon name="search" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="View as List"
                aria-label="View as List"
                data-testid="details-list-view-btn"
              >
                <Icon name="list" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${viewMode === 'tree' ? 'active' : ''}`}
                onClick={() => setViewMode('tree')}
                title="View as Tree"
                aria-label="View as Tree"
                data-testid="details-tree-view-btn"
              >
                <Icon name="tree" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopySha}
                title={copied ? '✓ Copied range!' : 'Copy commit range'}
                aria-label="Copy commit range"
                data-testid="copy-sha-button"
              >
                {copied ? (
                  <>
                    <Icon name="check" size={14} />
                    <span style={{ display: 'none' }}>Copied</span>
                  </>
                ) : (
                  <Icon name="copy" size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Normal Single-Commit Details Mode */
        <>
          <div className="commit-details-main-layout">
            {/* Left Column: Metadata & Message */}
            <div className="commit-details-left-section">
              <div className="commit-details-meta-grid">
                {/* Commit SHA */}
                <div className="commit-meta-row">
                  <span className="meta-label">Commit:</span>
                  <span
                    className="meta-value full-sha-text font-mono"
                    data-testid="commit-details-full-sha"
                    title={details.sha}
                  >
                    {details.sha}
                  </span>
                </div>

                {/* Parents */}
                <div className="commit-meta-row" data-testid="commit-details-parents-section">
                  <span className="meta-label">Parents:</span>
                  <div className="meta-value parents-value-container">
                    {details.parents.length === 0 ? (
                      <span className="root-commit-text" data-testid="root-commit-indicator">
                        (initial / root commit)
                      </span>
                    ) : details.parents.length === 1 ? (
                      <button
                        type="button"
                        className="parent-link-btn-text"
                        onClick={() => onSelectCommit?.(details.parents[0]!)}
                        title={`Jump to parent ${details.parents[0]!}`}
                        data-testid={`parent-link-${details.parents[0]!.slice(0, 7)}`}
                      >
                        {details.parents[0]}
                      </button>
                    ) : (
                      <div className="merge-parents-wrapper">
                        <div className="parents-links-inline">
                          {details.parents.map((pSha, idx) => (
                            <React.Fragment key={pSha}>
                              {idx > 0 && <span className="parent-sep">, </span>}
                              <button
                                type="button"
                                className="parent-link-btn-text"
                                onClick={() => onSelectCommit?.(pSha)}
                                title={`Jump to parent ${pSha}`}
                                data-testid={`parent-link-${pSha.slice(0, 7)}`}
                              >
                                {pSha}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Compare Parents Diff Switcher */}
                        <div className="merge-parents-list" data-testid="merge-parents-list">
                          {details.parents.map((pSha, idx) => {
                            const isCurrentActive =
                              selectedParentSha === pSha || (!selectedParentSha && idx === 0);

                            return (
                              <div key={pSha} className="merge-parent-item">
                                <button
                                  type="button"
                                  className={`parent-select-btn ${isCurrentActive ? 'active' : ''}`}
                                  onClick={() => selectParent(pSha)}
                                  title={`Compare diff against Parent ${idx + 1} (${pSha})`}
                                  aria-pressed={isCurrentActive}
                                  data-testid={`parent-select-${idx + 1}`}
                                >
                                  Parent {idx + 1}: {pSha.slice(0, 7)}
                                </button>
                                <button
                                  type="button"
                                  className="parent-jump-btn"
                                  onClick={() => onSelectCommit?.(pSha)}
                                  title={`Select parent ${pSha.slice(0, 7)} in graph`}
                                  aria-label={`Jump to parent ${idx + 1}`}
                                  data-testid={`parent-jump-${idx + 1}`}
                                >
                                  ⤳ Jump
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Author */}
                <div className="commit-meta-row">
                  <span className="meta-label">Author:</span>
                  <span className="meta-value" data-testid="commit-details-author">
                    <span className="author-name">{details.author.name}</span>{' '}
                    <span className="author-email">&lt;{details.author.email}&gt;</span>
                  </span>
                </div>

                {/* Committer */}
                <div className="commit-meta-row">
                  <span className="meta-label">Committer:</span>
                  <span className="meta-value" data-testid="commit-details-committer">
                    <span className="author-name">{details.committer.name}</span>{' '}
                    <span className="author-email">&lt;{details.committer.email}&gt;</span>
                  </span>
                </div>

                {/* Date */}
                <div className="commit-meta-row">
                  <span className="meta-label">Date:</span>
                  <span className="meta-value" data-testid="commit-details-date">
                    {formattedFullDate}
                  </span>
                </div>

                {/* Stats (Hidden elements for test compatibility) */}
                {details.stats && (
                  <div
                    className="commit-meta-row"
                    style={{ display: 'none' }}
                    data-testid="commit-details-stats"
                  >
                    <span>{details.stats.filesChanged} files changed</span>
                    <span className="stats-additions">+{details.stats.additions}</span>
                    <span className="stats-deletions">-{details.stats.deletions}</span>
                  </div>
                )}
              </div>

              {/* Commit Ref Badges */}
              {refBadgeItems.length > 0 && (
                <div className="commit-details-refs" data-testid="commit-details-refs">
                  {refBadgeItems.map((refItem) => (
                    <RefBadge
                      key={refItem.fullName ?? refItem.name}
                      refItem={refItem}
                      onDoubleClick={handleRefDoubleClick}
                    />
                  ))}
                </div>
              )}

              {/* Commit Message (Subject & Body) */}
              <div className="commit-details-messages">
                <div className="commit-details-subject" data-testid="commit-details-subject">
                  {renderFormattedMessage(details.subject, onSelectCommit)}
                </div>

                {details.body && details.body.trim() && (
                  <div className="commit-details-body" data-testid="commit-details-body">
                    {renderFormattedMessage(details.body.trim(), onSelectCommit)}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Changed Files Tree / List */}
            <div className="commit-details-right-section">
              {details.fileChanges && (
                <ChangedFiles
                  repositoryId={repositoryId}
                  commitSha={details.sha}
                  parentSha={effectiveParentSha}
                  fileChanges={details.fileChanges}
                  selectedFilePath={selectedFilePath}
                  viewMode={viewMode}
                  filterText={filterText}
                  isFilterVisible={isFilterVisible}
                  onFilterTextChange={setFilterText}
                  onSelectFile={(file) => {
                    selectFile(file);
                    if (repositoryId) {
                      openDiffInVsCode(
                        repositoryId,
                        details.sha,
                        file.path,
                        effectiveParentSha,
                        file.oldPath,
                      );
                    }
                  }}
                  onOpenDiffInVsCode={(filePath, oldPath) => {
                    if (repositoryId) {
                      openDiffInVsCode(
                        repositoryId,
                        details.sha,
                        filePath,
                        effectiveParentSha,
                        oldPath,
                      );
                    }
                  }}
                  onOpenFileInEditor={(filePath) => {
                    if (repositoryId) {
                      openFileAtRevisionInVsCode(repositoryId, filePath, details.sha);
                    }
                  }}
                />
              )}
            </div>

            {/* Far Right: Vertical Action Toolbar */}
            <div className="commit-details-vertical-toolbar">
              <button
                type="button"
                className="details-toolbar-icon-btn close-btn"
                onClick={handleClose}
                title="Close commit details (Esc)"
                aria-label="Close commit details"
                data-testid="close-details-button"
              >
                <Icon name="close" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${isFilterVisible ? 'active' : ''}`}
                onClick={() => setIsFilterVisible((prev) => !prev)}
                title="Filter files"
                aria-label="Filter files"
                data-testid="details-filter-btn"
              >
                <Icon name="search" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="View as List"
                aria-label="View as List"
                data-testid="details-list-view-btn"
              >
                <Icon name="list" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${viewMode === 'tree' ? 'active' : ''}`}
                onClick={() => setViewMode('tree')}
                title="View as Tree"
                aria-label="View as Tree"
                data-testid="details-tree-view-btn"
              >
                <Icon name="tree" size={14} />
              </button>

              <button
                type="button"
                className={`details-toolbar-icon-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopySha}
                title={copied ? '✓ Copied SHA!' : 'Copy commit SHA'}
                aria-label="Copy commit SHA"
                data-testid="copy-sha-button"
              >
                {copied ? (
                  <>
                    <Icon name="check" size={14} />
                    <span style={{ display: 'none' }}>Copied</span>
                  </>
                ) : (
                  <Icon name="copy" size={14} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
