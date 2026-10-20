import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';

export interface RebaseDialogProps {
  target: string;
  currentBranch?: string;
  isPublished: boolean;
  upstream?: string;
  isOpen: boolean;
  onClose: () => void;
  onRebase: (target: string, ignoreDate: boolean, confirmedPublishedBranch: boolean) => void;
}

export const RebaseDialog: React.FC<RebaseDialogProps> = ({
  target,
  currentBranch,
  isPublished,
  upstream,
  isOpen,
  onClose,
  onRebase,
}) => {
  const [confirmedRisk, setConfirmedRisk] = useState(false);
  const [ignoreDate, setIgnoreDate] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmedRisk(false);
      setIgnoreDate(false);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, target]);

  const canSubmit = !isPublished || confirmedRisk;

  const handleConfirm = () => {
    if (!canSubmit) {
      return;
    }
    onRebase(target, ignoreDate, isPublished ? confirmedRisk : false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="rebase-dialog-title"
      overlayClassName="rebase-modal-overlay"
      dialogClassName="rebase-dialog"
      overlayTestId="rebase-dialog-overlay"
      dialogTestId="rebase-dialog"
    >
      <ModalTitle className="rebase-dialog-title" id="rebase-dialog-title">
        Rebase <strong>{currentBranch || 'current branch'}</strong> onto <em>{target}</em>
      </ModalTitle>

      {isPublished ? (
        <div className="rebase-dialog-warning" role="alert" data-testid="rebase-published-warning">
          <Icon
            name="alert-circle"
            className="rebase-dialog-warning-icon"
            testId="rebase-warning-icon"
          />
          <div className="rebase-dialog-warning-text">
            <p>
              This branch{upstream ? ` tracks '${upstream}' and` : ''} appears to be published to a
              remote. Rebasing rewrites history and can disrupt collaborators.
            </p>
            <CheckboxField
              labelClassName="rebase-dialog-checkbox-label"
              labelTestId="rebase-dialog-risk-label"
              checkboxClassName="rebase-dialog-checkbox"
              checkboxTestId="rebase-dialog-risk-checkbox"
              checked={confirmedRisk}
              onChange={setConfirmedRisk}
            >
              <span>I understand the risks of rewriting published history</span>
            </CheckboxField>
          </div>
        </div>
      ) : null}

      <div className="rebase-dialog-options">
        <CheckboxField
          labelClassName="rebase-dialog-checkbox-label"
          labelTestId="rebase-dialog-ignore-date-label"
          checkboxClassName="rebase-dialog-checkbox"
          checkboxTestId="rebase-dialog-ignore-date-checkbox"
          checked={ignoreDate}
          onChange={setIgnoreDate}
        >
          <span>Update committer dates to now (--ignore-date)</span>
        </CheckboxField>
      </div>

      <ModalActions
        className="rebase-dialog-actions"
        actions={[
          {
            text: 'Rebase',
            onClick: handleConfirm,
            testId: 'rebase-dialog-confirm-btn',
            className: 'rebase-dialog-btn primary',
            disabled: !canSubmit,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'rebase-dialog-cancel-btn',
            className: 'rebase-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
