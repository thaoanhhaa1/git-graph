import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { RadioGroup } from '../../components/ui/RadioGroup';
import type { OperationMergeFastForwardMode } from '@git-graph/shared';
import {
  getLastMergeFastForwardMode,
  saveLastMergeFastForwardMode,
} from '../../stores/persistence';

export interface MergeDialogProps {
  target: string;
  currentBranch?: string;
  isOpen: boolean;
  initialFastForwardMode?: OperationMergeFastForwardMode;
  onClose: () => void;
  onMerge: (
    target: string,
    fastForwardMode: OperationMergeFastForwardMode,
    squash: boolean,
    noCommit: boolean,
  ) => void;
}

export const MergeDialog: React.FC<MergeDialogProps> = ({
  target,
  currentBranch,
  isOpen,
  initialFastForwardMode,
  onClose,
  onMerge,
}) => {
  const [fastForwardMode, setFastForwardMode] = useState<OperationMergeFastForwardMode>(
    () => initialFastForwardMode ?? getLastMergeFastForwardMode() ?? 'ff',
  );
  const [squash, setSquash] = useState(false);
  const [noCommit, setNoCommit] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFastForwardMode(initialFastForwardMode ?? getLastMergeFastForwardMode() ?? 'ff');
      setSquash(false);
      setNoCommit(false);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, target, initialFastForwardMode]);

  const handleConfirm = () => {
    saveLastMergeFastForwardMode(fastForwardMode);
    onMerge(target, fastForwardMode, squash, squash ? false : noCommit);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="merge-dialog-title"
      overlayClassName="merge-modal-overlay"
      dialogClassName="merge-dialog"
      overlayTestId="merge-dialog-overlay"
      dialogTestId="merge-dialog"
    >
      <ModalTitle className="merge-dialog-title" id="merge-dialog-title">
        Merge <em>{target}</em> into <strong>{currentBranch || 'current branch'}</strong>
      </ModalTitle>

      <div className="merge-dialog-form">
        <ModalField
          rowClassName="merge-dialog-field-row merge-dialog-radio-row"
          labelClassName="merge-dialog-field-label"
          labelTestId="merge-dialog-ff-label"
          label="Fast-forward:"
        >
          <div className="merge-dialog-radio-group">
            <RadioGroup
              name="merge-fast-forward-mode"
              value={fastForwardMode}
              onChange={(value) => setFastForwardMode(value as OperationMergeFastForwardMode)}
              itemClassName="merge-dialog-radio-label"
              options={[
                {
                  value: 'ff',
                  label: 'Default (fast-forward when possible)',
                  testId: 'merge-dialog-ff-default',
                },
                {
                  value: 'no-ff',
                  label: 'No fast-forward (--no-ff)',
                  testId: 'merge-dialog-ff-no-ff',
                },
                {
                  value: 'ff-only',
                  label: 'Fast-forward only (--ff-only)',
                  testId: 'merge-dialog-ff-only',
                },
              ]}
            />
          </div>
        </ModalField>

        <div className="merge-dialog-options">
          <CheckboxField
            labelClassName="merge-dialog-checkbox-label"
            labelTestId="merge-dialog-squash-label"
            checkboxClassName="merge-dialog-checkbox"
            checkboxTestId="merge-dialog-squash-checkbox"
            checked={squash}
            onChange={(checked) => {
              setSquash(checked);
              if (checked) {
                setNoCommit(false);
              }
            }}
          >
            <span>Squash commits (--squash)</span>
          </CheckboxField>

          <CheckboxField
            labelClassName="merge-dialog-checkbox-label"
            labelTestId="merge-dialog-no-commit-label"
            checkboxClassName="merge-dialog-checkbox"
            checkboxTestId="merge-dialog-no-commit-checkbox"
            checked={noCommit}
            onChange={setNoCommit}
            disabled={squash}
          >
            <span>Do not commit automatically (--no-commit)</span>
          </CheckboxField>
        </div>
      </div>

      <ModalActions
        className="merge-dialog-actions"
        actions={[
          {
            text: 'Merge',
            onClick: handleConfirm,
            testId: 'merge-dialog-confirm-btn',
            className: 'merge-dialog-btn primary',
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'merge-dialog-cancel-btn',
            className: 'merge-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
