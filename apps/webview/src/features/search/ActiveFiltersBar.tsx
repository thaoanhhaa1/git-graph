import React from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { requestCommitsPage } from '../../messaging/messageRouter';

export interface ActiveFiltersBarProps {
  className?: string;
  onClearAll?: () => void;
}

export const ActiveFiltersBar: React.FC<ActiveFiltersBarProps> = ({
  className = 'active-filters-bar',
  onClearAll,
}) => {
  const selectedBranch = useGraphStore((s) => s.selectedBranch);
  const searchTerm = useGraphStore((s) => s.searchTerm);
  const searchType = useGraphStore((s) => s.searchType);
  const filterAuthor = useGraphStore((s) => s.filterAuthor);
  const filterDateSince = useGraphStore((s) => s.filterDateSince);
  const filterDateUntil = useGraphStore((s) => s.filterDateUntil);
  const filterPath = useGraphStore((s) => s.filterPath);

  const hasBranchFilter = selectedBranch !== 'all';
  const hasSearchFilter = Boolean(searchTerm.trim());
  const hasAuthorFilter = Boolean(filterAuthor.trim());
  const hasDateFilter = Boolean(filterDateSince.trim() || filterDateUntil.trim());
  const hasPathFilter = Boolean(filterPath.trim());

  const hasAnyFilter =
    hasBranchFilter || hasSearchFilter || hasAuthorFilter || hasDateFilter || hasPathFilter;

  if (!hasAnyFilter) {
    return null;
  }

  const handleClearBranch = () => {
    useGraphStore.getState().setSelectedBranch('all');
    useSelectionStore.getState().clearSelection();
    requestCommitsPage();
  };

  const handleClearSearch = () => {
    useGraphStore.getState().setSearchTerm('', { resetCommits: false });
    useGraphStore.getState().setSearchMatches([]);
  };

  const handleClearAuthor = () => {
    useGraphStore.getState().setFilterAuthor('');
    useSelectionStore.getState().clearSelection();
    requestCommitsPage();
  };

  const handleClearDate = () => {
    useGraphStore.getState().setFilterDateRange('', '');
    useSelectionStore.getState().clearSelection();
    requestCommitsPage();
  };

  const handleClearPath = () => {
    useGraphStore.getState().setFilterPath('');
    useSelectionStore.getState().clearSelection();
    requestCommitsPage();
  };

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      useGraphStore.getState().clearAllFilters();
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    }
  };

  const searchTypeLabel = {
    all: 'All',
    subject: 'Subject',
    author: 'Author',
    hash: 'Hash',
    ref: 'Branch/Tag',
  }[searchType];

  return (
    <div
      className={className}
      data-testid="active-filters-bar"
      role="region"
      aria-label="Active filters"
    >
      <span className="active-filters-label">Filters:</span>

      <div className="active-filters-chips">
        {hasBranchFilter && (
          <span className="filter-chip" data-testid="filter-chip-branch">
            <span className="filter-chip-text">
              Branch: <strong>{selectedBranch}</strong>
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              onClick={handleClearBranch}
              aria-label={`Remove branch filter ${selectedBranch}`}
              title="Remove branch filter"
              data-testid="remove-filter-branch"
            >
              ✕
            </button>
          </span>
        )}

        {hasSearchFilter && (
          <span className="filter-chip" data-testid="filter-chip-search">
            <span className="filter-chip-text">
              Search ({searchTypeLabel}): <strong>&ldquo;{searchTerm}&rdquo;</strong>
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              onClick={handleClearSearch}
              aria-label="Clear search filter"
              title="Clear search filter"
              data-testid="remove-filter-search"
            >
              ✕
            </button>
          </span>
        )}

        {hasAuthorFilter && (
          <span className="filter-chip" data-testid="filter-chip-author">
            <span className="filter-chip-text">
              Author: <strong>{filterAuthor}</strong>
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              onClick={handleClearAuthor}
              aria-label={`Remove author filter ${filterAuthor}`}
              title="Remove author filter"
              data-testid="remove-filter-author"
            >
              ✕
            </button>
          </span>
        )}

        {hasDateFilter && (
          <span className="filter-chip" data-testid="filter-chip-date">
            <span className="filter-chip-text">
              Date:{' '}
              <strong>
                {filterDateSince || '…'} .. {filterDateUntil || '…'}
              </strong>
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              onClick={handleClearDate}
              aria-label="Remove date filter"
              title="Remove date filter"
              data-testid="remove-filter-date"
            >
              ✕
            </button>
          </span>
        )}

        {hasPathFilter && (
          <span className="filter-chip" data-testid="filter-chip-path">
            <span className="filter-chip-text">
              Path: <strong>{filterPath}</strong>
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              onClick={handleClearPath}
              aria-label={`Remove path filter ${filterPath}`}
              title="Remove path filter"
              data-testid="remove-filter-path"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      <button
        type="button"
        className="clear-all-filters-btn"
        onClick={handleClearAll}
        aria-label="Clear all active filters"
        title="Reset all filters to default"
        data-testid="clear-all-filters-btn"
      >
        Clear all
      </button>
    </div>
  );
};
