import React, { useState, useRef, useEffect } from 'react';
import type { CommitOrdering } from '@git-graph/shared';
import { useConfigStore } from '../../stores/configStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { requestCommitsPage, requestUpdateViewConfig } from '../../messaging/messageRouter';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Select } from '../../components/ui/Select';

const PAGE_SIZE_OPTIONS = [
  { value: '100', label: '100' },
  { value: '250', label: '250' },
  { value: '500', label: '500 (Default)' },
  { value: '1000', label: '1000' },
];

export const ViewConfigMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const config = useConfigStore((s) => s.config);
  const setShowAuthor = useConfigStore((s) => s.setShowAuthor);
  const setShowDate = useConfigStore((s) => s.setShowDate);
  const setShowRemoteBranches = useConfigStore((s) => s.setShowRemoteBranches);
  const setShowTags = useConfigStore((s) => s.setShowTags);
  const setDateType = useConfigStore((s) => s.setDateType);
  const setPageSize = useConfigStore((s) => s.setPageSize);
  const setCommitOrdering = useConfigStore((s) => s.setCommitOrdering);
  const setCompactMode = useConfigStore((s) => s.setCompactMode);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = () => setIsOpen((prev) => !prev);

  return (
    <div className="view-config-menu-container" ref={menuRef} data-testid="view-config-menu">
      <Button
        variant="icon"
        className={`view-config-trigger ${isOpen ? 'active' : ''}`}
        onClick={toggleOpen}
        title="View Settings & Column Visibility"
        aria-label="View Settings"
        data-tooltip="View Settings & Columns"
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="view-config-trigger"
      >
        <Icon name="view-columns" />
      </Button>

      {isOpen && (
        <div
          className="view-config-dropdown"
          role="menu"
          aria-label="View Settings Options"
          data-testid="view-config-dropdown"
        >
          <div className="view-config-section-title">Columns</div>
          <label className="view-config-item">
            <Checkbox
              checked={config.showAuthor}
              onChange={(e) => setShowAuthor(e.target.checked)}
              data-testid="toggle-show-author"
            />
            <span>Show Author</span>
          </label>

          <label className="view-config-item">
            <Checkbox
              checked={config.showDate}
              onChange={(e) => setShowDate(e.target.checked)}
              data-testid="toggle-show-date"
            />
            <span>Show Date</span>
          </label>

          <div className="view-config-divider" />

          <div className="view-config-section-title">Ref Badges</div>
          <label className="view-config-item">
            <Checkbox
              checked={config.showRemoteBranches}
              onChange={(e) => setShowRemoteBranches(e.target.checked)}
              data-testid="toggle-show-remote-branches"
            />
            <span>Remote Branches</span>
          </label>

          <label className="view-config-item">
            <Checkbox
              checked={config.showTags}
              onChange={(e) => setShowTags(e.target.checked)}
              data-testid="toggle-show-tags"
            />
            <span>Tags</span>
          </label>

          <div className="view-config-divider" />

          <div className="view-config-section-title">Date Format</div>
          <RadioGroup
            name="dateFormat"
            value={config.dateType}
            onChange={setDateType}
            itemClassName="view-config-item"
            options={[
              {
                value: 'default',
                label: 'Default (e.g. 4 Aug 2026 23:14)',
                testId: 'radio-date-default',
              },
              {
                value: 'relative',
                label: 'Relative (e.g. 2h ago)',
                testId: 'radio-date-relative',
              },
              {
                value: 'absolute',
                label: 'Absolute (e.g. 2026-09-18)',
                testId: 'radio-date-absolute',
              },
            ]}
          />

          <div className="view-config-divider" />

          <div className="view-config-section-title">Commit Ordering</div>
          <RadioGroup
            name="commitOrdering"
            value={config.commitOrdering ?? 'date-order'}
            onChange={(order) => {
              const nextOrder = order as CommitOrdering;
              setCommitOrdering(nextOrder);
              useSelectionStore.getState().clearSelection();
              requestCommitsPage({ order: nextOrder });
              requestUpdateViewConfig({ commitOrdering: nextOrder });
            }}
            itemClassName="view-config-item"
            options={[
              {
                value: 'date-order',
                label: 'Date Order (Default)',
                testId: 'radio-order-date',
              },
              {
                value: 'topo-order',
                label: 'Topological Order',
                testId: 'radio-order-topo',
              },
              {
                value: 'author-date-order',
                label: 'Author Date Order',
                testId: 'radio-order-author-date',
              },
            ]}
          />

          <div className="view-config-divider" />

          <div className="view-config-section-title">Display</div>
          <label className="view-config-item">
            <Checkbox
              checked={config.compactMode}
              onChange={(e) => setCompactMode(e.target.checked)}
              data-testid="toggle-compact-mode"
            />
            <span>Compact View (18px)</span>
          </label>

          <div className="view-config-divider" />

          <div className="view-config-section-title">Page Size</div>
          <label className="view-config-item">
            <span>Commits per page</span>
            <Select
              value={String(config.pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
              data-testid="select-page-size"
              aria-label="Commits per page"
              options={PAGE_SIZE_OPTIONS}
              style={{
                marginLeft: 'auto',
                background: 'var(--vscode-dropdown-background)',
                color: 'var(--vscode-dropdown-foreground)',
                border: '1px solid var(--vscode-dropdown-border)',
                borderRadius: '3px',
                padding: '2px 4px',
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};
