import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { RadioGroup } from '../../components/ui/RadioGroup';
import type { OperationResetMode } from '@git-graph/shared';

export interface ResetDialogProps {
  target: string;
  targetSubject?: string;
  targetAuthor?: string;
  targetDate?: string;
  initialMode?: OperationResetMode;
  isOpen: boolean;
  onClose: () => void;
  onReset: (target: string, mode: OperationResetMode, confirmedHardReset: boolean) => void;
}

export const ResetDialog: React.FC<ResetDialogProps> = ({
  target,
  targetSubject,
  targetAuthor,
  targetDate,
  initialMode = 'mixed',
  isOpen,
  onClose,
  onReset,
}) => {
  const [mode, setMode] = useState<OperationResetMode>(initialMode);
  const [confirmedHard, setConfirmedHard] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setConfirmedHard(false);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, target, initialMode]);

  const isHard = mode === 'hard';
  const canSubmit = !isHard || confirmedHard;

  const handleConfirm = () => {
    if (!canSubmit) {
      return;
    }
    onReset(target, mode, isHard && confirmedHard);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="reset-dialog-title"
      overlayClassName="reset-modal-overlay"
      dialogClassName={`reset-dialog ${isHard ? 'reset-dialog-danger' : ''}`}
      overlayTestId="reset-dialog-overlay"
      dialogTestId="reset-dialog"
    >
      <ModalTitle className="reset-dialog-title" id="reset-dialog-title">
        Reset current branch to commit <em>{target.slice(0, 8)}</em>
      </ModalTitle>

      <div className="reset-dialog-target" data-testid="reset-dialog-target">
        {targetSubject ? <p className="reset-dialog-target-subject">{targetSubject}</p> : null}
        <p className="reset-dialog-target-meta">
          {target.slice(0, 12)}
          {targetAuthor ? ` • ${targetAuthor}` : ''}
          {targetDate ? ` • ${targetDate}` : ''}
        </p>
      </div>

      <div className="reset-dialog-modes">
        <RadioGroup
          name="reset-mode"
          value={mode}
          onChange={(value) => setMode(value as OperationResetMode)}
          itemClassName="reset-dialog-radio-label"
          options={[
            {
              value: 'soft',
              label: (
                <>
                  <strong>Soft (--soft)</strong>
                  <span className="reset-dialog-radio-hint">Keep changes staged in the index.</span>
                </>
              ),
              testId: 'reset-dialog-mode-soft',
            },
            {
              value: 'mixed',
              label: (
                <>
                  <strong>Mixed (--mixed)</strong>
                  <span className="reset-dialog-radio-hint">
                    Keep changes in the working tree, unstaged.
                  </span>
                </>
              ),
              testId: 'reset-dialog-mode-mixed',
            },
            {
              value: 'hard',
              label: (
                <>
                  <strong>Hard (--hard)</strong>
                  <span className="reset-dialog-radio-hint">
                    Discard all changes in the working tree and index.
                  </span>
                </>
              ),
              testId: 'reset-dialog-mode-hard',
            },
          ]}
        />
      </div>

      {isHard ? (
        <div className="reset-dialog-danger-banner" role="alert" data-testid="reset-hard-warning">
          <p>This permanently discards all uncommitted changes in your working tree and index.</p>
          <CheckboxField
            labelClassName="reset-dialog-checkbox-label"
            labelTestId="reset-dialog-hard-confirm-label"
            checkboxClassName="reset-dialog-checkbox"
            checkboxTestId="reset-dialog-hard-confirm-checkbox"
            checked={confirmedHard}
            onChange={setConfirmedHard}
          >
            <span>Discard all uncommitted changes permanently</span>
          </CheckboxField>
        </div>
      ) : null}

      <ModalActions
        className="reset-dialog-actions"
        actions={[
          {
            text: isHard ? 'Reset (Hard)' : 'Reset',
            onClick: handleConfirm,
            testId: 'reset-dialog-confirm-btn',
            className: `reset-dialog-btn primary ${isHard ? 'danger' : ''}`,
            disabled: !canSubmit,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'reset-dialog-cancel-btn',
            className: 'reset-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
