import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { parseBranchDisplayInfo } from './RenameBranchDialog';

export interface DeleteBranchDialogProps {
  branchName: string;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (branchName: string, forceDelete: boolean, deleteOnRemote: boolean) => void;
}

export const DeleteBranchDialog: React.FC<DeleteBranchDialogProps> = ({
  branchName,
  isOpen,
  onClose,
  onDelete,
}) => {
  const { cleanBranchName, isRemote } = useMemo(
    () => parseBranchDisplayInfo(branchName),
    [branchName],
  );
  const [forceDelete, setForceDelete] = useState(false);
  const [deleteOnRemote, setDeleteOnRemote] = useState(isRemote);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setForceDelete(false);
      setDeleteOnRemote(isRemote);
      setTimeout(() => {
        if (confirmBtnRef.current) {
          confirmBtnRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, isRemote]);

  const handleConfirm = () => {
    onDelete(cleanBranchName, forceDelete, deleteOnRemote);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="delete-branch-title"
      overlayClassName="delete-branch-modal-overlay"
      dialogClassName="delete-branch-dialog"
      overlayTestId="delete-branch-dialog-overlay"
      dialogTestId="delete-branch-dialog"
    >
      <ModalTitle className="delete-branch-title" id="delete-branch-title">
        Are you sure you want to delete the branch <em>{cleanBranchName}</em>?
      </ModalTitle>

      <div className="delete-branch-options">
        <CheckboxField
          labelClassName="delete-branch-checkbox-label"
          labelTestId="delete-branch-force-label"
          checkboxClassName="delete-branch-checkbox"
          checkboxTestId="delete-branch-force-checkbox"
          checked={forceDelete}
          onChange={setForceDelete}
        >
          <span>Force Delete</span>
        </CheckboxField>

        <CheckboxField
          labelClassName="delete-branch-checkbox-label"
          labelTestId="delete-branch-remote-label"
          checkboxClassName="delete-branch-checkbox"
          checkboxTestId="delete-branch-remote-checkbox"
          checked={deleteOnRemote}
          onChange={setDeleteOnRemote}
        >
          <span>Delete this branch on the remote</span>
          <span
            className="delete-branch-info-icon"
            title="This will also delete the branch from the remote repository."
            aria-label="Info: This will also delete the branch from the remote repository."
          >
            ⓘ
          </span>
        </CheckboxField>
      </div>

      <ModalActions
        className="delete-branch-actions"
        actions={[
          {
            text: 'Yes, delete',
            onClick: handleConfirm,
            testId: 'delete-branch-confirm-btn',
            className: 'delete-branch-btn primary',
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'delete-branch-cancel-btn',
            className: 'delete-branch-btn',
          },
        ]}
      />
    </Modal>
  );
};
