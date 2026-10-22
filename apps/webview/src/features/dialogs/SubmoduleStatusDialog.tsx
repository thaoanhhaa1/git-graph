import React from 'react';
import type { SubmoduleInfo, SubmoduleState } from '@git-graph/shared';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { t } from '../../i18n';

export interface SubmoduleStatusDialogProps {
  isOpen: boolean;
  submodules: SubmoduleInfo[];
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpen: (path: string) => void;
}

function stateLabel(state: SubmoduleState): string {
  switch (state) {
    case 'clean':
      return t('submodule.clean');
    case 'dirty':
      return t('submodule.dirty');
    case 'uninitialized':
      return t('submodule.uninitialized');
    default:
      return t('submodule.unknown');
  }
}

export const SubmoduleStatusDialog: React.FC<SubmoduleStatusDialogProps> = ({
  isOpen,
  submodules,
  isLoading = false,
  error,
  onClose,
  onRefresh,
  onOpen,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="submodule-status-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog submodule-status-dialog"
      overlayTestId="submodule-status-dialog-overlay"
      dialogTestId="submodule-status-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="submodule-status-dialog-title">
        {t('submodule.title')}
      </ModalTitle>
      <p className="sync-dialog-muted">{t('submodule.description')}</p>

      <div className="remote-manager-list" role="list" data-testid="submodule-status-list">
        {isLoading && submodules.length === 0 ? (
          <p className="sync-dialog-muted" role="status" data-testid="submodule-status-loading">
            {t('submodule.loading')}
          </p>
        ) : submodules.length === 0 ? (
          <p className="sync-dialog-muted" data-testid="submodule-status-empty">
            {t('submodule.empty')}
          </p>
        ) : (
          submodules.map((submodule) => (
            <div
              className="remote-manager-row"
              data-testid={`submodule-status-row-${submodule.path}`}
              key={submodule.path}
            >
              <div className="remote-manager-row-main">
                <strong className="remote-manager-name" title={submodule.path}>
                  {submodule.name}
                </strong>
                <span className="remote-manager-url">{submodule.path}</span>
                {submodule.url ? (
                  <span className="remote-manager-url" title={submodule.url}>
                    {submodule.url}
                  </span>
                ) : null}
                <div className="worktree-manager-badges">
                  <span
                    className={`submodule-state-badge submodule-state-${submodule.state}`}
                    data-testid={`submodule-state-${submodule.path}`}
                  >
                    {stateLabel(submodule.state)}
                  </span>
                  {typeof submodule.ahead === 'number' && submodule.ahead > 0 ? (
                    <span className="worktree-badge">
                      {t('submodule.ahead', { count: submodule.ahead })}
                    </span>
                  ) : null}
                  {typeof submodule.behind === 'number' && submodule.behind > 0 ? (
                    <span className="worktree-badge">
                      {t('submodule.behind', { count: submodule.behind })}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="remote-manager-row-actions">
                <Button
                  className="remote-manager-action-btn"
                  onClick={() => onOpen(submodule.path)}
                  disabled={submodule.state === 'uninitialized'}
                  data-testid={`submodule-open-${submodule.path}`}
                >
                  <Icon name="git-graph" size={12} /> {t('submodule.open')}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="submodule-status-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: t('common.refresh'),
            onClick: onRefresh,
            testId: 'submodule-status-refresh-btn',
            className: 'sync-dialog-btn',
            disabled: isLoading,
          },
          {
            text: t('common.close'),
            onClick: onClose,
            testId: 'submodule-status-close-btn',
            className: 'sync-dialog-btn primary',
          },
        ]}
      />
    </Modal>
  );
};
