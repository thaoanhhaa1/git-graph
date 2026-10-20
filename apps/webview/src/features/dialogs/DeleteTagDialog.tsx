import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';

export interface DeleteTagDialogProps {
  tagName: string;
  remotes?: string[];
  isOpen: boolean;
  onClose: () => void;
  onDelete: (tagName: string, deleteOnRemote: boolean, remote?: string) => void;
}

const EMPTY_REMOTES: string[] = [];

export const DeleteTagDialog: React.FC<DeleteTagDialogProps> = ({
  tagName,
  remotes = EMPTY_REMOTES,
  isOpen,
  onClose,
  onDelete,
}) => {
  const cleanTagName = tagName.replace(/^refs\/tags\//, '');
  const [deleteOnRemote, setDeleteOnRemote] = useState(false);
  const [remote, setRemote] = useState(remotes[0] ?? 'origin');
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const defaultRemote = remotes[0] ?? 'origin';

  useEffect(() => {
    if (isOpen) {
      setDeleteOnRemote(false);
      setRemote(defaultRemote);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, tagName, defaultRemote]);

  const handleConfirm = () => {
    onDelete(cleanTagName, deleteOnRemote, deleteOnRemote ? remote : undefined);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="delete-tag-title"
      overlayClassName="delete-tag-modal-overlay"
      dialogClassName="delete-tag-dialog"
      overlayTestId="delete-tag-dialog-overlay"
      dialogTestId="delete-tag-dialog"
    >
      <ModalTitle className="delete-tag-title" id="delete-tag-title">
        Are you sure you want to delete the tag <em>{cleanTagName}</em>?
      </ModalTitle>

      <div className="delete-tag-options">
        <CheckboxField
          labelClassName="delete-tag-checkbox-label"
          labelTestId="delete-tag-remote-label"
          checkboxClassName="delete-tag-checkbox"
          checkboxTestId="delete-tag-remote-checkbox"
          checked={deleteOnRemote}
          onChange={setDeleteOnRemote}
        >
          <span>Delete this tag on the remote</span>
          <span
            className="delete-tag-info-icon"
            title="This will also delete the tag from the remote repository."
            aria-label="Info: This will also delete the tag from the remote repository."
          >
            ⓘ
          </span>
        </CheckboxField>

        {deleteOnRemote && remotes.length > 1 ? (
          <Select
            className="delete-tag-select"
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            data-testid="delete-tag-remote-select"
            aria-label="Remote to delete the tag from"
            options={remotes.map((item) => ({ value: item, label: item }))}
          />
        ) : null}
      </div>

      <ModalActions
        className="delete-tag-actions"
        actions={[
          {
            text: 'Yes, delete',
            onClick: handleConfirm,
            testId: 'delete-tag-confirm-btn',
            className: 'delete-tag-btn primary',
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'delete-tag-cancel-btn',
            className: 'delete-tag-btn',
          },
        ]}
      />
    </Modal>
  );
};
