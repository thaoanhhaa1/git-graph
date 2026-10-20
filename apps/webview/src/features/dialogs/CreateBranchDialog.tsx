import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { TextInput } from '../../components/ui/TextInput';
import { Checkbox } from '../../components/ui/Checkbox';

export interface CreateBranchDialogProps {
  commitSha: string;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, commitSha: string, checkout: boolean) => void;
}

export const CreateBranchDialog: React.FC<CreateBranchDialogProps> = ({
  commitSha,
  isOpen,
  onClose,
  onCreate,
}) => {
  const shortSha = commitSha.slice(0, 8);
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCheckout(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, commitSha]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onCreate(trimmed, commitSha, checkout);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="create-branch-title"
      overlayClassName="create-branch-modal-overlay"
      dialogClassName="create-branch-dialog"
      overlayTestId="create-branch-dialog-overlay"
      dialogTestId="create-branch-dialog"
    >
      <ModalTitle className="create-branch-title" id="create-branch-title">
        Create branch at commit <em>{shortSha}</em>:
      </ModalTitle>

      <div className="create-branch-form">
        <ModalField
          rowClassName="create-branch-field-row"
          labelClassName="create-branch-field-label"
          labelTestId="create-branch-name-label"
          htmlFor="create-branch-name-input"
          label="Name:"
        >
          <TextInput
            id="create-branch-name-input"
            ref={inputRef}
            className="create-branch-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="create-branch-name-input"
            aria-label="New branch name"
            spellCheck={false}
            autoFocus
          />
        </ModalField>

        <ModalField
          rowClassName="create-branch-field-row"
          labelClassName="create-branch-field-label"
          labelTestId="create-branch-checkout-label"
          htmlFor="create-branch-checkout-checkbox"
          label="Check out:"
        >
          <div className="create-branch-checkbox-wrapper">
            <Checkbox
              id="create-branch-checkout-checkbox"
              className="create-branch-checkbox"
              checked={checkout}
              onChange={(e) => setCheckout(e.target.checked)}
              data-testid="create-branch-checkout-checkbox"
            />
          </div>
        </ModalField>
      </div>

      <ModalActions
        className="create-branch-actions"
        actions={[
          {
            text: 'Create Branch',
            onClick: handleConfirm,
            testId: 'create-branch-confirm-btn',
            className: 'create-branch-btn primary',
            disabled: !name.trim(),
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'create-branch-cancel-btn',
            className: 'create-branch-btn',
          },
        ]}
      />
    </Modal>
  );
};
