import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { RadioGroup } from '../../components/ui/RadioGroup';
import type { RefBadgeItem } from '../refs/RefBadge';

export type BranchDropAction = 'merge' | 'rebase' | 'reset';

export interface BranchDropActionDialogProps {
  isOpen: boolean;
  source: RefBadgeItem | null;
  targetSha: string | null;
  targetShortSha?: string;
  onClose: () => void;
  onConfirm: (action: BranchDropAction, source: RefBadgeItem) => void;
}

export const BranchDropActionDialog: React.FC<BranchDropActionDialogProps> = ({
  isOpen,
  source,
  targetSha,
  targetShortSha,
  onClose,
  onConfirm,
}) => {
  const [action, setAction] = useState<BranchDropAction>('merge');
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAction('merge');
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    }
  }, [isOpen, source?.name, targetSha]);

  const handleConfirm = () => {
    if (!source) return;
    onConfirm(action, source);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="branch-drop-dialog-title"
      overlayClassName="branch-drop-modal-overlay"
      dialogClassName="branch-drop-dialog"
      overlayTestId="branch-drop-dialog-overlay"
      dialogTestId="branch-drop-dialog"
    >
      <ModalTitle className="branch-drop-dialog-title" id="branch-drop-dialog-title">
        Apply branch <em>{source?.name}</em> to commit{' '}
        <strong>{targetShortSha ?? targetSha}</strong>
      </ModalTitle>

      <div className="branch-drop-dialog-form">
        <RadioGroup
          name="branch-drop-action"
          value={action}
          onChange={(value) => setAction(value as BranchDropAction)}
          itemClassName="branch-drop-dialog-radio-label"
          options={[
            {
              value: 'merge',
              label: `Merge ${source?.name ?? 'branch'} into the current branch`,
              testId: 'branch-drop-action-merge',
            },
            {
              value: 'rebase',
              label: 'Rebase the current branch onto the target commit',
              testId: 'branch-drop-action-rebase',
            },
            {
              value: 'reset',
              label: 'Reset the current branch to the target commit',
              testId: 'branch-drop-action-reset',
            },
          ]}
        />
      </div>

      <ModalActions
        className="branch-drop-dialog-actions"
        actions={[
          {
            text: 'Continue',
            onClick: handleConfirm,
            testId: 'branch-drop-confirm-btn',
            className: 'branch-drop-dialog-btn primary',
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'branch-drop-cancel-btn',
            className: 'branch-drop-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};

BranchDropActionDialog.displayName = 'BranchDropActionDialog';
