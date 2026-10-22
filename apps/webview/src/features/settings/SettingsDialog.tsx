import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Select } from '../../components/ui/Select';
import { TextInput } from '../../components/ui/TextInput';
import { useConfigStore, DEFAULT_VIEW_CONFIG, type ViewConfig } from '../../stores/configStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { loadPersistedState } from '../../stores/persistence';
import { requestCommitsPage, requestUpdateViewConfig } from '../../messaging/messageRouter';
import type { CommitOrdering } from '@git-graph/shared';

export type SettingsCategory = 'display' | 'git' | 'graph' | 'performance';

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: Array<{ id: SettingsCategory; label: string }> = [
  { id: 'display', label: 'Display' },
  { id: 'git', label: 'Git' },
  { id: 'graph', label: 'Graph' },
  { id: 'performance', label: 'Performance' },
];

const PAGE_SIZE_OPTIONS = [
  { value: '100', label: '100 commits' },
  { value: '250', label: '250 commits' },
  { value: '500', label: '500 commits (default)' },
  { value: '1000', label: '1000 commits' },
];

const ORDERING_OPTIONS: Array<{ value: CommitOrdering; label: string; testId: string }> = [
  { value: 'date-order', label: 'Date order (default)', testId: 'settings-order-date' },
  { value: 'topo-order', label: 'Topological order', testId: 'settings-order-topo' },
  { value: 'author-date-order', label: 'Author date order', testId: 'settings-order-author' },
];

interface SettingRowProps {
  id: string;
  label: string;
  description: string;
  control: React.ReactNode;
  isDefault: boolean;
  onReset: () => void;
}

const SettingRow: React.FC<SettingRowProps> = ({
  id,
  label,
  description,
  control,
  isDefault,
  onReset,
}) => (
  <div className="settings-row" data-testid={`settings-row-${id}`}>
    <div className="settings-row-text">
      <span className="settings-row-label">{label}</span>
      <span className="settings-row-description">{description}</span>
    </div>
    <div className="settings-row-control">{control}</div>
    <Button
      variant="none"
      className="settings-reset-btn"
      onClick={onReset}
      disabled={isDefault}
      title={`Reset ${label} to default`}
      aria-label={`Reset ${label} to default`}
      data-testid={`settings-reset-${id}`}
    >
      Reset
    </Button>
  </div>
);

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState<SettingsCategory>('display');
  const [blameFormatDraft, setBlameFormatDraft] = useState('');

  const config = useConfigStore((s) => s.config);
  const columnWidthsResetToken = useConfigStore((s) => s.columnWidthsResetToken);

  useEffect(() => {
    if (isOpen) {
      setBlameFormatDraft(config.blameFormat);
    }
  }, [isOpen, config.blameFormat]);

  const updateConfig = useConfigStore((s) => s.updateConfig);
  const resetConfig = useConfigStore((s) => s.resetConfig);
  const resetColumnWidths = useConfigStore((s) => s.resetColumnWidths);

  const apply = useCallback(
    (partial: Partial<ViewConfig>) => {
      updateConfig(partial);
      requestUpdateViewConfig(partial);
    },
    [updateConfig],
  );

  const handleOrderingChange = useCallback(
    (order: CommitOrdering) => {
      apply({ commitOrdering: order });
      useSelectionStore.getState().clearSelection();
      requestCommitsPage({ order });
    },
    [apply],
  );

  const handleResetAll = useCallback(() => {
    resetConfig();
    requestUpdateViewConfig(DEFAULT_VIEW_CONFIG);
    useSelectionStore.getState().clearSelection();
    requestCommitsPage({ order: DEFAULT_VIEW_CONFIG.commitOrdering });
  }, [resetConfig]);

  const columnWidthsSummary = useMemo(() => {
    // Re-read when the reset token changes so the displayed values stay accurate.
    void columnWidthsResetToken;
    const widths = loadPersistedState()?.columnWidths;
    if (!widths || Object.keys(widths).length === 0) {
      return 'Auto (default)';
    }
    const parts: string[] = [];
    if (widths.graph) parts.push(`Graph ${widths.graph}px`);
    if (widths.description) parts.push(`Description ${widths.description}px`);
    if (widths.date) parts.push(`Date ${widths.date}px`);
    if (widths.author) parts.push(`Author ${widths.author}px`);
    if (widths.commit) parts.push(`Commit ${widths.commit}px`);
    return parts.length > 0 ? parts.join(' · ') : 'Auto (default)';
  }, [columnWidthsResetToken]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="settings-dialog-title"
      overlayClassName="settings-modal-overlay"
      dialogClassName="settings-dialog"
      overlayTestId="settings-dialog-overlay"
      dialogTestId="settings-dialog"
    >
      <ModalTitle className="settings-dialog-title" id="settings-dialog-title">
        Git Graph Settings
      </ModalTitle>

      <div className="settings-dialog-body">
        <nav className="settings-tabs" role="tablist" aria-label="Settings categories">
          {CATEGORIES.map((entry) => (
            <Button
              key={entry.id}
              variant="none"
              role="tab"
              aria-selected={category === entry.id}
              className={`settings-tab ${category === entry.id ? 'active' : ''}`}
              onClick={() => setCategory(entry.id)}
              data-testid={`settings-tab-${entry.id}`}
            >
              {entry.label}
            </Button>
          ))}
        </nav>

        <div
          className="settings-panel"
          role="tabpanel"
          aria-label={`${category} settings`}
          data-testid={`settings-panel-${category}`}
        >
          {category === 'display' && (
            <>
              <SettingRow
                id="showAuthor"
                label="Show author column"
                description="Display the commit author in the graph table."
                isDefault={config.showAuthor === DEFAULT_VIEW_CONFIG.showAuthor}
                onReset={() => apply({ showAuthor: DEFAULT_VIEW_CONFIG.showAuthor })}
                control={
                  <Checkbox
                    checked={config.showAuthor}
                    onChange={(e) => apply({ showAuthor: e.target.checked })}
                    aria-label="Show author column"
                    data-testid="settings-show-author"
                  />
                }
              />
              <SettingRow
                id="showDate"
                label="Show date column"
                description="Display the commit date in the graph table."
                isDefault={config.showDate === DEFAULT_VIEW_CONFIG.showDate}
                onReset={() => apply({ showDate: DEFAULT_VIEW_CONFIG.showDate })}
                control={
                  <Checkbox
                    checked={config.showDate}
                    onChange={(e) => apply({ showDate: e.target.checked })}
                    aria-label="Show date column"
                    data-testid="settings-show-date"
                  />
                }
              />
              <SettingRow
                id="showRemoteBranches"
                label="Show remote branches"
                description="Display remote branch badges on commits."
                isDefault={config.showRemoteBranches === DEFAULT_VIEW_CONFIG.showRemoteBranches}
                onReset={() =>
                  apply({ showRemoteBranches: DEFAULT_VIEW_CONFIG.showRemoteBranches })
                }
                control={
                  <Checkbox
                    checked={config.showRemoteBranches}
                    onChange={(e) => apply({ showRemoteBranches: e.target.checked })}
                    aria-label="Show remote branches"
                    data-testid="settings-show-remote-branches"
                  />
                }
              />
              <SettingRow
                id="showTags"
                label="Show tags"
                description="Display tag badges on commits."
                isDefault={config.showTags === DEFAULT_VIEW_CONFIG.showTags}
                onReset={() => apply({ showTags: DEFAULT_VIEW_CONFIG.showTags })}
                control={
                  <Checkbox
                    checked={config.showTags}
                    onChange={(e) => apply({ showTags: e.target.checked })}
                    aria-label="Show tags"
                    data-testid="settings-show-tags"
                  />
                }
              />
              <SettingRow
                id="dateType"
                label="Date format"
                description="Choose how commit dates are rendered."
                isDefault={config.dateType === DEFAULT_VIEW_CONFIG.dateType}
                onReset={() => apply({ dateType: DEFAULT_VIEW_CONFIG.dateType })}
                control={
                  <RadioGroup
                    name="settings-date-type"
                    value={config.dateType}
                    onChange={(value) =>
                      apply({ dateType: value as ViewConfig['dateType'], dateTypeExplicit: true })
                    }
                    itemClassName="settings-radio-option"
                    options={[
                      { value: 'default', label: 'Default', testId: 'settings-date-default' },
                      { value: 'relative', label: 'Relative', testId: 'settings-date-relative' },
                      { value: 'absolute', label: 'Absolute', testId: 'settings-date-absolute' },
                    ]}
                  />
                }
              />
              <SettingRow
                id="compactMode"
                label="Compact rows"
                description="Use 18px rows for a denser commit list."
                isDefault={config.compactMode === DEFAULT_VIEW_CONFIG.compactMode}
                onReset={() => apply({ compactMode: DEFAULT_VIEW_CONFIG.compactMode })}
                control={
                  <Checkbox
                    checked={config.compactMode}
                    onChange={(e) => apply({ compactMode: e.target.checked })}
                    aria-label="Compact rows"
                    data-testid="settings-compact-mode"
                  />
                }
              />
            </>
          )}

          {category === 'git' && (
            <>
              <SettingRow
                id="showStatusBarItem"
                label="Status bar item"
                description="Show the Git Graph shortcut in the VS Code status bar."
                isDefault={config.showStatusBarItem === DEFAULT_VIEW_CONFIG.showStatusBarItem}
                onReset={() => apply({ showStatusBarItem: DEFAULT_VIEW_CONFIG.showStatusBarItem })}
                control={
                  <Checkbox
                    checked={config.showStatusBarItem}
                    onChange={(e) => apply({ showStatusBarItem: e.target.checked })}
                    aria-label="Show status bar item"
                    data-testid="settings-status-bar-item"
                  />
                }
              />
              <SettingRow
                id="blameEnabled"
                label="Inline blame annotations"
                description="Show blame information after each line in the active editor."
                isDefault={config.blameEnabled === DEFAULT_VIEW_CONFIG.blameEnabled}
                onReset={() => apply({ blameEnabled: DEFAULT_VIEW_CONFIG.blameEnabled })}
                control={
                  <Checkbox
                    checked={config.blameEnabled}
                    onChange={(e) => apply({ blameEnabled: e.target.checked })}
                    aria-label="Enable inline blame annotations"
                    data-testid="settings-blame-enabled"
                  />
                }
              />
              <SettingRow
                id="blameFormat"
                label="Blame annotation format"
                description="Placeholders: ${author}, ${relativeDate}, ${subject}, ${shortSha}, ${sha}."
                isDefault={config.blameFormat === DEFAULT_VIEW_CONFIG.blameFormat}
                onReset={() => {
                  setBlameFormatDraft(DEFAULT_VIEW_CONFIG.blameFormat);
                  apply({ blameFormat: DEFAULT_VIEW_CONFIG.blameFormat });
                }}
                control={
                  <TextInput
                    className="settings-text-input"
                    value={blameFormatDraft}
                    onChange={(e) => setBlameFormatDraft(e.target.value)}
                    onBlur={() => {
                      const next = blameFormatDraft.trim() || DEFAULT_VIEW_CONFIG.blameFormat;
                      setBlameFormatDraft(next);
                      if (next !== config.blameFormat) {
                        apply({ blameFormat: next });
                      }
                    }}
                    aria-label="Blame annotation format"
                    data-testid="settings-blame-format"
                  />
                }
              />
            </>
          )}

          {category === 'graph' && (
            <>
              <SettingRow
                id="commitOrdering"
                label="Commit ordering"
                description="Strategy used by git log when loading the graph."
                isDefault={config.commitOrdering === DEFAULT_VIEW_CONFIG.commitOrdering}
                onReset={() => handleOrderingChange(DEFAULT_VIEW_CONFIG.commitOrdering)}
                control={
                  <RadioGroup
                    name="settings-commit-ordering"
                    value={config.commitOrdering}
                    onChange={(value) => handleOrderingChange(value as CommitOrdering)}
                    itemClassName="settings-radio-option"
                    options={ORDERING_OPTIONS}
                  />
                }
              />
              <SettingRow
                id="showMinimap"
                label="Graph minimap"
                description="Show a vertical overview of the entire graph on the right."
                isDefault={config.showMinimap === DEFAULT_VIEW_CONFIG.showMinimap}
                onReset={() => apply({ showMinimap: DEFAULT_VIEW_CONFIG.showMinimap })}
                control={
                  <Checkbox
                    checked={config.showMinimap}
                    onChange={(e) => apply({ showMinimap: e.target.checked })}
                    aria-label="Show graph minimap"
                    data-testid="settings-show-minimap"
                  />
                }
              />
            </>
          )}

          {category === 'performance' && (
            <>
              <SettingRow
                id="pageSize"
                label="Commits per page"
                description="Number of commits requested from Git per page."
                isDefault={config.pageSize === DEFAULT_VIEW_CONFIG.pageSize}
                onReset={() => apply({ pageSize: DEFAULT_VIEW_CONFIG.pageSize })}
                control={
                  <Select
                    className="settings-select"
                    value={String(config.pageSize)}
                    onChange={(e) => apply({ pageSize: Number(e.target.value) })}
                    aria-label="Commits per page"
                    data-testid="settings-page-size"
                    options={PAGE_SIZE_OPTIONS}
                  />
                }
              />
              <SettingRow
                id="columnWidths"
                label="Column widths"
                description={columnWidthsSummary}
                isDefault={columnWidthsSummary === 'Auto (default)'}
                onReset={resetColumnWidths}
                control={
                  <Button
                    variant="secondary"
                    className="settings-secondary-btn"
                    onClick={resetColumnWidths}
                    data-testid="settings-reset-column-widths"
                  >
                    Reset widths
                  </Button>
                }
              />
              <SettingRow
                id="resetAll"
                label="Reset all view settings"
                description="Restore every display, graph and performance setting to its default."
                isDefault={false}
                onReset={handleResetAll}
                control={
                  <Button
                    variant="secondary"
                    className="settings-secondary-btn"
                    onClick={handleResetAll}
                    data-testid="settings-reset-all"
                  >
                    Reset all
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>

      <ModalActions
        className="settings-dialog-actions"
        actions={[
          {
            text: 'Done',
            onClick: onClose,
            testId: 'settings-dialog-close-btn',
            className: 'settings-dialog-btn primary',
          },
        ]}
      />
    </Modal>
  );
};

SettingsDialog.displayName = 'SettingsDialog';
