import React, { useState } from 'react';
import { RepositorySelector } from '../repository/RepositorySelector';
import { BranchSelector } from './BranchSelector';
import { AuthorSelector } from './AuthorSelector';
import { SearchInput } from '../search/SearchInput';
import { ViewConfigMenu } from './ViewConfigMenu';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { useGraphStore } from '../../stores/graphStore';
import { useConfigStore } from '../../stores/configStore';
import { useSelectionStore } from '../../stores/selectionStore';
import {
  requestRepositoriesList,
  requestGraphRefresh,
  requestFetch,
} from '../../messaging/messageRouter';

export interface ToolbarProps {
  onRefresh?: () => void;
  onFetch?: () => void;
  onStash?: () => void;
  onManageStashes?: () => void;
  searchDebounceMs?: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onRefresh,
  onFetch,
  onStash,
  onManageStashes,
  searchDebounceMs = 250,
}) => {
  const isRepoLoading = useRepositoryStore((s) => s.isLoading);
  const isGraphLoading = useGraphStore((s) => s.isLoading);
  const isLoadingMore = useGraphStore((s) => s.isLoadingMore);
  const repositories = useRepositoryStore((s) => s.repositories);
  const activeRepo = useRepositoryStore((s) => s.getActiveRepository());
  const showRemoteBranches = useConfigStore((s) => s.config.showRemoteBranches);
  const setShowRemoteBranches = useConfigStore((s) => s.setShowRemoteBranches);

  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const isFetching = useGraphStore((s) => s.isFetching);
  const isBusy = isRepoLoading || isGraphLoading;

  const handleRefresh = () => {
    useGraphStore.getState().setError(null);
    useRepositoryStore.getState().setError(null);
    if (onRefresh) {
      onRefresh();
    } else {
      if (repositories.length === 0) {
        requestRepositoriesList(true);
      } else {
        requestGraphRefresh(false);
      }
    }
  };

  const handleFetch = () => {
    useGraphStore.getState().setError(null);
    useRepositoryStore.getState().setError(null);
    if (onFetch) {
      onFetch();
    } else {
      requestFetch();
    }
  };

  const handleScrollToHead = () => {
    const currentCommits = useGraphStore.getState().commits;
    const headCommit =
      currentCommits.find((c) => c.refs?.some((r) => r.kind === 'head' || r.name === 'HEAD')) ||
      currentCommits[0];
    if (headCommit) {
      useSelectionStore.getState().selectCommit(headCommit.shortSha);
    }
    const container = document.querySelector('.commit-table-container');
    if (container) {
      container.scrollTop = 0;
    }
  };

  return (
    <header className="toolbar" role="toolbar" aria-label="Git Graph Toolbar">
      <div className="toolbar-group toolbar-filters">
        <label htmlFor="repo-select" className="sr-only" style={{ display: 'none' }}>
          Repository
        </label>
        {repositories.length > 1 ? (
          <div className="toolbar-control-wrapper">
            <label htmlFor="repo-select" className="toolbar-label">
              Repo:
            </label>
            <RepositorySelector id="repo-select" />
          </div>
        ) : (
          <div style={{ display: 'none' }}>
            <RepositorySelector id="repo-select" />
          </div>
        )}

        <BranchSelector id="branch-select" />

        {activeRepo?.currentBranch && (
          <div
            className="toolbar-current-branch-badge"
            title={`Current branch: ${activeRepo.currentBranch}`}
            aria-label={`Current branch: ${activeRepo.currentBranch}`}
            data-testid="toolbar-current-branch"
            style={{ display: 'none' }}
          >
            <span className="current-branch-dot">●</span>
            <span className="current-branch-label">{activeRepo.currentBranch}</span>
          </div>
        )}

        <AuthorSelector id="author-select" />

        <label className="toolbar-checkbox-label" title="Show remote branches">
          <Checkbox
            className="toolbar-checkbox"
            id="toolbar-remote-branches-checkbox"
            aria-label="Show remote branches"
            checked={showRemoteBranches}
            onChange={(e) => setShowRemoteBranches(e.target.checked)}
          />
          <span>Remote</span>
        </label>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group toolbar-actions">
        {/* 1. Find HEAD button */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title="Find Head (Scroll to Current)"
          aria-label="Find Head"
          data-tooltip="Scroll to Head"
          onClick={handleScrollToHead}
        >
          <Icon name="find-head" />
        </Button>

        {/* 2. Search button */}
        <Button
          variant="icon"
          className={`btn-toolbar-action ${isSearchVisible ? 'active' : ''}`}
          title="Search Commits"
          aria-label="Search Commits"
          data-tooltip="Search Commits"
          onClick={() => setIsSearchVisible((v) => !v)}
        >
          <Icon name="search" />
        </Button>

        {/* Search input field */}
        {isSearchVisible ? (
          <div className="toolbar-search-wrapper visible">
            <SearchInput id="search-input" debounceMs={searchDebounceMs} />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none',
              width: 0,
              height: 0,
              overflow: 'hidden',
            }}
          >
            <SearchInput id="search-input" debounceMs={searchDebounceMs} />
          </div>
        )}

        {/* 3. Filter button */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title="Filter Commits"
          aria-label="Filter Commits"
          data-tooltip="Filter Commits"
          onClick={() => setIsSearchVisible((v) => !v)}
        >
          <Icon name="filter" />
        </Button>

        {/* 4. Branch Tree */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title="Branch Tree"
          aria-label="Branch Tree"
          data-tooltip="Branches Tree"
          onClick={() => {
            const select = document.getElementById('branch-select') as HTMLSelectElement | null;
            if (select) select.focus();
          }}
        >
          <Icon name="branch-tree" />
        </Button>

        {/* 5. View Columns menu */}
        <ViewConfigMenu />

        {/* 6. Settings button */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title="Repository Settings"
          aria-label="Repository Settings"
          data-tooltip="Repository Settings"
          data-tooltip-pos="bottom-right"
          onClick={() => {
            const trigger = document.querySelector(
              '[data-testid="view-config-trigger"]',
            ) as HTMLButtonElement | null;
            if (trigger) trigger.click();
          }}
        >
          <Icon name="settings" />
        </Button>

        {/* Stash actions */}
        {onStash ? (
          <Button
            variant="icon"
            className="btn-toolbar-action"
            title="Stash working tree changes"
            aria-label="Stash changes"
            data-tooltip="Stash Changes"
            onClick={onStash}
            data-testid="toolbar-stash-btn"
          >
            <Icon name="stash" />
          </Button>
        ) : null}
        {onManageStashes ? (
          <Button
            variant="icon"
            className="btn-toolbar-action"
            title="Manage stashes"
            aria-label="Manage stashes"
            data-tooltip="Manage Stashes"
            onClick={onManageStashes}
            data-testid="toolbar-stash-manager-btn"
          >
            <Icon name="archive" />
          </Button>
        ) : null}

        {/* 6.5. Fetch from Remote button */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title={isFetching ? 'Fetching from remote...' : 'Fetch commits from remote'}
          aria-label="Fetch commits from remote"
          data-tooltip={isFetching ? undefined : 'Fetch from Remote'}
          data-tooltip-pos="bottom-right"
          onClick={handleFetch}
          disabled={isBusy || isFetching}
          data-testid="toolbar-fetch-btn"
        >
          {isFetching ? (
            <Icon name="fetch-spinner" spinning testId="fetch-spinner" />
          ) : (
            <Icon name="fetch" />
          )}
        </Button>

        {/* 7. Refresh button */}
        <Button
          variant="icon"
          className="btn-toolbar-action"
          title={isBusy ? 'Refreshing...' : 'Refresh repository'}
          aria-label="Refresh repository"
          data-tooltip={isBusy ? undefined : 'Refresh Repository'}
          data-tooltip-pos="bottom-right"
          onClick={handleRefresh}
          disabled={isBusy || isFetching}
          data-testid="toolbar-refresh-btn"
        >
          <Icon name="refresh" spinning={isBusy} />
        </Button>

        {(isBusy || isLoadingMore || isFetching) && (
          <span
            className="toolbar-loading-indicator spinning"
            title={isFetching ? 'Fetching from remote...' : 'Loading commits...'}
            aria-label={isFetching ? 'Fetching from remote...' : 'Loading commits...'}
            role="status"
            data-testid="toolbar-loading-indicator"
          >
            ●
          </span>
        )}
      </div>
    </header>
  );
};
