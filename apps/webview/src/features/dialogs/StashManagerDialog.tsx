import React from 'react';
import type { StashEntry } from '@git-graph/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';

export interface StashManagerDialogProps {
  isOpen: boolean;
  stashes: StashEntry[];
  isLoading?: boolean;
  onClose: () => void;
  onApply: (entry: StashEntry) => void;
  onPop: (entry: StashEntry) => void;
  onDrop: (entry: StashEntry) => void;
  onCreateStash?: () => void;
}

export const StashManagerDialog: React.FC<StashManagerDialogProps> = ({
  isOpen,
  stashes,
  isLoading = false,
  onClose,
  onApply,
  onPop,
  onDrop,
  onCreateStash,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="stash-manager-dialog-title"
      overlayClassName="stash-manager-modal-overlay"
      dialogClassName="stash-manager-dialog"
      overlayTestId="stash-manager-dialog-overlay"
      dialogTestId="stash-manager-dialog"
    >
      <ModalTitle className="stash-manager-dialog-title" id="stash-manager-dialog-title">
        Stashes
      </ModalTitle>

      {isLoading ? (
        <div className="stash-manager-loading" role="status" data-testid="stash-manager-loading">
          <span className="loading-spinner" />
          <span>Loading stashes...</span>
        </div>
      ) : stashes.length === 0 ? (
        <p className="stash-manager-empty" data-testid="stash-manager-empty">
          There are no stashes in this repository.
        </p>
      ) : (
        <div className="stash-manager-list" role="list" data-testid="stash-manager-list">
          {stashes.map((entry) => (
            <div
              key={entry.ref}
              className="stash-manager-item"
              role="listitem"
              data-testid={`stash-manager-item-${entry.index}`}
            >
              <div className="stash-manager-item-info">
                <span className="stash-manager-item-ref" data-testid={`stash-ref-${entry.index}`}>
                  {entry.ref}
                </span>
                <span className="stash-manager-item-message" title={entry.message}>
                  {entry.message}
                </span>
                {entry.branch ? (
                  <span className="stash-manager-item-branch">{entry.branch}</span>
                ) : null}
              </div>
              <div className="stash-manager-item-actions">
                <Button
                  variant="icon"
                  className="stash-manager-action-btn"
                  title={`Apply ${entry.ref}`}
                  aria-label={`Apply ${entry.ref}`}
                  onClick={() => onApply(entry)}
                  data-testid={`stash-apply-${entry.index}`}
                >
                  <Icon name="check" size={13} />
                </Button>
                <Button
                  variant="icon"
                  className="stash-manager-action-btn"
                  title={`Pop ${entry.ref}`}
                  aria-label={`Pop ${entry.ref}`}
                  onClick={() => onPop(entry)}
                  data-testid={`stash-pop-${entry.index}`}
                >
                  <Icon name="stash" size={13} />
                </Button>
                <Button
                  variant="icon"
                  className="stash-manager-action-btn danger"
                  title={`Drop ${entry.ref}`}
                  aria-label={`Drop ${entry.ref}`}
                  onClick={() => onDrop(entry)}
                  data-testid={`stash-drop-${entry.index}`}
                >
                  <Icon name="trash" size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalActions
        className="stash-manager-dialog-actions"
        actions={[
          ...(onCreateStash
            ? [
                {
                  text: 'Stash Changes',
                  onClick: onCreateStash,
                  testId: 'stash-manager-create-btn',
                  className: 'stash-manager-dialog-btn primary',
                },
              ]
            : []),
          {
            text: 'Close',
            onClick: onClose,
            testId: 'stash-manager-close-btn',
            className: 'stash-manager-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
