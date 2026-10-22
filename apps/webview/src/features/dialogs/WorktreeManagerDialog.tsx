import React, { useEffect, useRef, useState } from 'react';
import type { GitWorktreeInfo } from '@git-graph/shared';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';
import { t } from '../../i18n';

export interface WorktreeManagerDialogProps {
  isOpen: boolean;
  worktrees: GitWorktreeInfo[];
  currentPath?: string;
  isLoading?: boolean;
  error?: string | null;
  isRunning?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAdd: (path: string, branch?: string, newBranch?: string) => void;
  onRemove: (path: string, force: boolean) => void;
  onOpen: (path: string) => void;
}

function shortSha(value?: string): string {
  return value ? value.slice(0, 7) : '—';
}

export const WorktreeManagerDialog: React.FC<WorktreeManagerDialogProps> = ({
  isOpen,
  worktrees,
  currentPath,
  isLoading = false,
  error,
  isRunning = false,
  onClose,
  onRefresh,
  onAdd,
  onRemove,
  onOpen,
}) => {
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [removePath, setRemovePath] = useState<string | null>(null);
  const [forceRemove, setForceRemove] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPath('');
    setBranch('');
    setNewBranch('');
    setFormError(null);
    setRemovePath(null);
    setForceRemove(false);
    onRefresh();
    setTimeout(() => pathInputRef.current?.focus(), 50);
  }, [isOpen, onRefresh]);

  const handleAdd = () => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setFormError(t('worktree.pathRequired'));
      return;
    }
    setFormError(null);
    onAdd(trimmedPath, branch.trim() || undefined, newBranch.trim() || undefined);
    setPath('');
    setBranch('');
    setNewBranch('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="worktree-manager-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog worktree-manager-dialog"
      overlayTestId="worktree-manager-dialog-overlay"
      dialogTestId="worktree-manager-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="worktree-manager-dialog-title">
        {t('worktree.title')}
      </ModalTitle>
      <p className="sync-dialog-muted">{t('worktree.description')}</p>

      <div className="remote-manager-list" role="list" data-testid="worktree-manager-list">
        {isLoading && worktrees.length === 0 ? (
          <p className="sync-dialog-muted" role="status" data-testid="worktree-manager-loading">
            {t('worktree.loading')}
          </p>
        ) : worktrees.length === 0 ? (
          <p className="sync-dialog-muted" data-testid="worktree-manager-empty">
            {t('worktree.empty')}
          </p>
        ) : (
          worktrees.map((worktree) => {
            const isCurrent = worktree.isCurrent || worktree.path === currentPath;
            return (
              <div
                className="remote-manager-row"
                data-testid={`worktree-manager-row-${worktree.path}`}
                key={worktree.path}
              >
                <div className="remote-manager-row-main">
                  <strong className="remote-manager-name" title={worktree.path}>
                    {worktree.path}
                  </strong>
                  <span className="remote-manager-url">
                    {t('worktree.branch')}:{' '}
                    {worktree.branch ?? (worktree.isDetached ? t('worktree.detached') : '—')}
                  </span>
                  <span className="remote-manager-url">
                    {t('worktree.head')}: {shortSha(worktree.headSha)}
                  </span>
                  <div className="worktree-manager-badges">
                    {isCurrent && (
                      <span className="worktree-badge worktree-badge-current">
                        {t('worktree.current')}
                      </span>
                    )}
                    {worktree.isBare && (
                      <span className="worktree-badge">{t('worktree.bare')}</span>
                    )}
                    {worktree.isDetached && (
                      <span className="worktree-badge">{t('worktree.detached')}</span>
                    )}
                    {worktree.isLocked && (
                      <span className="worktree-badge" title={worktree.lockReason}>
                        {t('worktree.locked')}
                      </span>
                    )}
                    {worktree.isPrunable && (
                      <span className="worktree-badge" title={worktree.prunableReason}>
                        {t('worktree.prunable')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="remote-manager-row-actions">
                  <Button
                    className="remote-manager-action-btn"
                    onClick={() => onOpen(worktree.path)}
                    disabled={isRunning}
                    data-testid={`worktree-manager-open-${worktree.path}`}
                  >
                    <Icon name="worktree" size={12} /> {t('worktree.openInNewWindow')}
                  </Button>
                  <Button
                    className="remote-manager-action-btn danger"
                    onClick={() => {
                      setRemovePath(worktree.path);
                      setForceRemove(false);
                    }}
                    disabled={isRunning || isCurrent}
                    data-testid={`worktree-manager-remove-${worktree.path}`}
                  >
                    {t('worktree.remove')}
                  </Button>
                </div>

                {removePath === worktree.path ? (
                  <div className="remote-manager-remove-confirm">
                    <p>{t('worktree.confirmRemove', { path: worktree.path })}</p>
                    <CheckboxField
                      checked={forceRemove}
                      onChange={setForceRemove}
                      labelClassName="sync-dialog-checkbox-label"
                      checkboxTestId={`worktree-manager-force-${worktree.path}`}
                    >
                      {t('worktree.forceRemove')}
                    </CheckboxField>
                    <div className="remote-manager-inline-actions">
                      <Button
                        className="sync-dialog-btn primary danger"
                        onClick={() => {
                          onRemove(worktree.path, forceRemove);
                          setRemovePath(null);
                        }}
                        disabled={isRunning}
                        data-testid={`worktree-manager-confirm-remove-${worktree.path}`}
                      >
                        {t('worktree.removeTitle')}
                      </Button>
                      <Button
                        className="sync-dialog-btn"
                        onClick={() => setRemovePath(null)}
                        data-testid="worktree-manager-cancel-remove"
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="remote-manager-add">
        <span className="sync-dialog-section-title">{t('worktree.addTitle')}</span>
        <div className="remote-manager-add-fields">
          <TextInput
            ref={pathInputRef}
            className="sync-dialog-input"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={t('worktree.addPathPlaceholder')}
            aria-label={t('worktree.path')}
            spellCheck={false}
            data-testid="worktree-manager-add-path"
          />
          <TextInput
            className="sync-dialog-input"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder={t('worktree.branchPlaceholder')}
            aria-label={t('worktree.branch')}
            spellCheck={false}
            data-testid="worktree-manager-add-branch"
          />
          <TextInput
            className="sync-dialog-input"
            value={newBranch}
            onChange={(event) => setNewBranch(event.target.value)}
            placeholder={t('worktree.newBranchPlaceholder')}
            aria-label={t('worktree.newBranch')}
            spellCheck={false}
            data-testid="worktree-manager-add-new-branch"
          />
          <Button
            className="sync-dialog-btn primary"
            onClick={handleAdd}
            disabled={isRunning}
            data-testid="worktree-manager-add-btn"
          >
            {t('worktree.create')}
          </Button>
        </div>
        {formError ? (
          <div className="sync-dialog-error" role="alert" data-testid="worktree-manager-form-error">
            {formError}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="worktree-manager-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: t('common.refresh'),
            onClick: onRefresh,
            testId: 'worktree-manager-refresh-btn',
            className: 'sync-dialog-btn',
            disabled: isLoading || isRunning,
          },
          {
            text: t('common.close'),
            onClick: onClose,
            testId: 'worktree-manager-close-btn',
            className: 'sync-dialog-btn primary',
          },
        ]}
      />
    </Modal>
  );
};
