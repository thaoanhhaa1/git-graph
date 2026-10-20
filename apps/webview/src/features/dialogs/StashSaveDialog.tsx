import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { TextInput } from '../../components/ui/TextInput';

export interface StashSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (options: { message?: string; includeUntracked: boolean; keepIndex: boolean }) => void;
}

export const StashSaveDialog: React.FC<StashSaveDialogProps> = ({ isOpen, onClose, onSave }) => {
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [keepIndex, setKeepIndex] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setIncludeUntracked(false);
      setKeepIndex(false);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const trimmed = message.trim();
    onSave({
      ...(trimmed ? { message: trimmed } : {}),
      includeUntracked,
      keepIndex,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="stash-save-dialog-title"
      overlayClassName="stash-save-modal-overlay"
      dialogClassName="stash-save-dialog"
      overlayTestId="stash-save-dialog-overlay"
      dialogTestId="stash-save-dialog"
    >
      <ModalTitle className="stash-save-dialog-title" id="stash-save-dialog-title">
        Save Stash
      </ModalTitle>

      <ModalField
        rowClassName="stash-save-dialog-field-row"
        labelClassName="stash-save-dialog-field-label"
        labelTestId="stash-save-dialog-message-label"
        htmlFor="stash-save-dialog-message"
        label="Message (optional):"
      >
        <TextInput
          id="stash-save-dialog-message"
          className="stash-save-dialog-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe this stash"
          data-testid="stash-save-dialog-message"
        />
      </ModalField>

      <div className="stash-save-dialog-options">
        <CheckboxField
          labelClassName="stash-save-dialog-checkbox-label"
          labelTestId="stash-save-dialog-untracked-label"
          checkboxClassName="stash-save-dialog-checkbox"
          checkboxTestId="stash-save-dialog-untracked-checkbox"
          checked={includeUntracked}
          onChange={setIncludeUntracked}
        >
          <span>Include untracked files (-u)</span>
        </CheckboxField>
        <CheckboxField
          labelClassName="stash-save-dialog-checkbox-label"
          labelTestId="stash-save-dialog-keep-index-label"
          checkboxClassName="stash-save-dialog-checkbox"
          checkboxTestId="stash-save-dialog-keep-index-checkbox"
          checked={keepIndex}
          onChange={setKeepIndex}
        >
          <span>Keep staged changes in the index (--keep-index)</span>
        </CheckboxField>
      </div>

      <ModalActions
        className="stash-save-dialog-actions"
        actions={[
          {
            text: 'Save Stash',
            onClick: handleConfirm,
            testId: 'stash-save-dialog-confirm-btn',
            className: 'stash-save-dialog-btn primary',
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'stash-save-dialog-cancel-btn',
            className: 'stash-save-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
