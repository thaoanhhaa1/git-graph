import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SearchType } from '@git-graph/shared';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { requestCommitsPage } from '../../messaging/messageRouter';
import { TextInput } from '../../components/ui/TextInput';

export interface SearchInputProps {
  id?: string;
  placeholder?: string;
  debounceMs?: number;
  disabled?: boolean;
  className?: string;
  onSearch?: (term: string) => void;
  onSearchRepo?: (term: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  id = 'search-input',
  placeholder = 'Search commits, hash, author...',
  debounceMs = 250,
  disabled = false,
  className = 'search-input',
  onSearch,
  onSearchRepo,
}) => {
  const storeSearchTerm = useGraphStore((s) => s.searchTerm);
  const searchType = useGraphStore((s) => s.searchType);
  const searchMatches = useGraphStore((s) => s.searchMatches);
  const currentMatchIndex = useGraphStore((s) => s.currentMatchIndex);
  const repositories = useRepositoryStore((s) => s.repositories);

  const [localValue, setLocalValue] = useState(storeSearchTerm);
  const currentValueRef = useRef(storeSearchTerm);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external store changes into local state
  useEffect(() => {
    currentValueRef.current = storeSearchTerm;
    setLocalValue(storeSearchTerm);
  }, [storeSearchTerm]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const commitSearch = useCallback(
    (term: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (onSearch) {
        onSearch(term);
      } else {
        useGraphStore.getState().setSearchTerm(term, { resetCommits: false });
      }
    },
    [onSearch],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    currentValueRef.current = val;
    setLocalValue(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (debounceMs <= 0) {
      commitSearch(val);
    } else {
      debounceTimerRef.current = setTimeout(() => {
        commitSearch(val);
      }, debounceMs);
    }
  };

  const handleClear = () => {
    currentValueRef.current = '';
    setLocalValue('');
    commitSearch('');
    useGraphStore.getState().setSearchMatches([]);
  };

  const handleSearchRepo = () => {
    const term = currentValueRef.current.trim();
    if (onSearchRepo) {
      onSearchRepo(term);
    } else {
      useGraphStore.getState().setSearchTerm(term);
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClear();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (onSearch) {
        commitSearch(currentValueRef.current);
      } else if (searchMatches.length > 0) {
        if (e.shiftKey) {
          useGraphStore.getState().prevMatch();
        } else {
          useGraphStore.getState().nextMatch();
        }
      } else {
        handleSearchRepo();
      }
    }
  };

  const handleSearchTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value as SearchType;
    useGraphStore.getState().setSearchType(nextType);
  };

  const isControlDisabled = disabled || repositories.length === 0;
  const hasMatches = searchMatches.length > 0;
  const showMatchCount = localValue.trim().length > 0;

  return (
    <div className="search-box-wrapper" role="search" data-testid="search-box-wrapper">
      <select
        className="search-type-select"
        value={searchType}
        onChange={handleSearchTypeChange}
        disabled={isControlDisabled}
        aria-label="Search field selector"
        title="Search by field"
        data-testid="search-type-select"
      >
        <option value="all">All</option>
        <option value="subject">Subject</option>
        <option value="author">Author</option>
        <option value="hash">Hash</option>
        <option value="ref">Branch/Tag</option>
      </select>

      <div className="search-input-container">
        <TextInput
          id={id}
          type="search"
          aria-label="Search commits"
          className={className}
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onInput={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isControlDisabled}
          data-testid="search-input"
        />

        {showMatchCount && (
          <span
            className={`search-match-count ${hasMatches ? '' : 'no-match'}`}
            data-testid="search-match-count"
            title={hasMatches ? `${searchMatches.length} matching commits` : 'No loaded matches'}
          >
            {hasMatches ? `${currentMatchIndex + 1} of ${searchMatches.length}` : '0 of 0'}
          </span>
        )}

        {hasMatches && (
          <div className="search-nav-controls">
            <button
              type="button"
              className="search-nav-btn"
              onClick={() => useGraphStore.getState().prevMatch()}
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
              disabled={isControlDisabled}
              data-testid="search-prev-btn"
            >
              ▲
            </button>
            <button
              type="button"
              className="search-nav-btn"
              onClick={() => useGraphStore.getState().nextMatch()}
              aria-label="Next match"
              title="Next match (Enter)"
              disabled={isControlDisabled}
              data-testid="search-next-btn"
            >
              ▼
            </button>
          </div>
        )}

        {localValue && !isControlDisabled && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={handleClear}
            aria-label="Clear search"
            title="Clear search"
            data-testid="search-clear-btn"
          >
            ✕
          </button>
        )}
      </div>

      <button
        type="button"
        className="btn btn-secondary search-repo-btn"
        onClick={handleSearchRepo}
        disabled={isControlDisabled}
        aria-label="Search entire repository"
        title="Query entire repository via Git Core"
        data-testid="search-repo-btn"
      >
        Search in repo
      </button>
    </div>
  );
};
