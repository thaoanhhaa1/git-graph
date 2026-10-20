import React, { useState, useEffect, useCallback } from 'react';
import { TextInput } from '../../components/ui/TextInput';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { requestCommitsPage } from '../../messaging/messageRouter';

export interface PathFilterProps {
  id?: string;
  disabled?: boolean;
}

export const PathFilter: React.FC<PathFilterProps> = ({
  id = 'path-filter-input',
  disabled = false,
}) => {
  const filterPath = useGraphStore((s) => s.filterPath);
  const isLoading = useGraphStore((s) => s.isLoading);

  const [inputValue, setInputValue] = useState(filterPath);

  // Synchronize when store's filterPath changes (e.g. from ActiveFiltersBar remove or extension command)
  useEffect(() => {
    setInputValue(filterPath);
  }, [filterPath]);

  const applyPathFilter = useCallback(
    (newPath: string) => {
      const trimmed = newPath.trim();
      if (trimmed !== filterPath) {
        useGraphStore.getState().setFilterPath(trimmed);
        useSelectionStore.getState().clearSelection();
        requestCommitsPage();
      }
    },
    [filterPath],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPathFilter(inputValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(filterPath);
    }
  };

  const handleBlur = () => {
    applyPathFilter(inputValue);
  };

  const handleClear = () => {
    setInputValue('');
    if (filterPath) {
      useGraphStore.getState().setFilterPath('');
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    }
  };

  return (
    <div className="toolbar-control-wrapper path-filter-wrapper">
      <label htmlFor={id} className="toolbar-label">
        Path:
      </label>
      <div
        className="path-filter-input-container"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      >
        <TextInput
          id={id}
          className="select-control path-filter-input"
          placeholder="Filter by path..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled || isLoading}
          data-testid="path-filter-input"
          aria-label="Filter commits by path"
          style={{
            width: '120px',
            paddingRight: inputValue ? '20px' : '6px',
          }}
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear path filter"
            title="Clear path filter"
            data-testid="path-filter-clear-btn"
            style={{
              position: 'absolute',
              right: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--vscode-input-placeholderForeground, #888)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '11px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
