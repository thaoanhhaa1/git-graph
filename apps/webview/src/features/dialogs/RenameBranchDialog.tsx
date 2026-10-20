import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { TextInput } from '../../components/ui/TextInput';
import { CheckboxField } from '../../components/ui/Checkbox';

export interface RenameBranchDialogProps {
  branchName: string;
  isOpen: boolean;
  onClose: () => void;
  onRename: (oldName: string, newName: string, syncRemote?: boolean) => void;
}

export function parseBranchDisplayInfo(rawName: string): {
  cleanBranchName: string;
  isRemote: boolean;
  remote: string;
} {
  let name = rawName.replace(/^refs\/heads\//, '');
  let isRemote = false;
  let remote = 'origin';

  if (name.startsWith('refs/remotes/')) {
    const withoutPrefix = name.slice('refs/remotes/'.length);
    const slashIdx = withoutPrefix.indexOf('/');
    if (slashIdx > 0) {
      remote = withoutPrefix.slice(0, slashIdx);
      name = withoutPrefix.slice(slashIdx + 1);
    } else {
      name = withoutPrefix;
    }
    isRemote = true;
  } else if (name.startsWith('origin/')) {
    remote = 'origin';
    name = name.slice('origin/'.length);
    isRemote = true;
  }

  return { cleanBranchName: name, isRemote, remote };
}

export const RenameBranchDialog: React.FC<RenameBranchDialogProps> = ({
  branchName,
  isOpen,
  onClose,
  onRename,
}) => {
  const { cleanBranchName, isRemote } = React.useMemo(
    () => parseBranchDisplayInfo(branchName),
    [branchName],
  );
  const [newName, setNewName] = useState(cleanBranchName);
  const [syncRemote, setSyncRemote] = useState(isRemote);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initial input value when branchName changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setNewName(cleanBranchName);
      setSyncRemote(isRemote);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, cleanBranchName, isRemote]);

  const handleConfirm = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    onRename(cleanBranchName, trimmed, syncRemote);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="rename-branch-title"
      overlayClassName="rename-branch-modal-overlay"
      dialogClassName="rename-branch-dialog"
      overlayTestId="rename-branch-dialog-overlay"
      dialogTestId="rename-branch-dialog"
    >
      <ModalTitle className="rename-branch-title" id="rename-branch-title">
        Enter the new name for branch <em>{cleanBranchName}</em>:
      </ModalTitle>

      <TextInput
        ref={inputRef}
        className="rename-branch-input"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        data-testid="rename-branch-input"
        aria-label="New branch name"
        spellCheck={false}
        autoFocus
      />

      <CheckboxField
        labelClassName="rename-branch-checkbox-label"
        labelTestId="rename-branch-sync-remote-label"
        checkboxClassName="rename-branch-checkbox"
        checkboxTestId="rename-branch-sync-remote-checkbox"
        checked={syncRemote}
        onChange={setSyncRemote}
      >
        <span>Sync branch to remote (push new &amp; delete old on remote)</span>
      </CheckboxField>

      <ModalActions
        className="rename-branch-actions"
        actions={[
          {
            text: 'Rename Branch',
            onClick: handleConfirm,
            testId: 'rename-branch-confirm-btn',
            className: 'rename-branch-btn primary',
            disabled: !newName.trim(),
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'rename-branch-cancel-btn',
            className: 'rename-branch-btn',
          },
        ]}
      />
    </Modal>
  );
};
