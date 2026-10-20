import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';

export interface SequencerCommitDialogProps {
  action: 'cherry-pick' | 'revert';
  commitSha: string;
  commitSubject?: string;
  parents?: string[];
  parentSubjects?: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mainlineParent: number | undefined, noCommit: boolean) => void;
}

const ACTION_LABELS = {
  'cherry-pick': {
    title: 'Cherry-pick',
    confirm: 'Cherry-pick',
    testPrefix: 'cherry-pick-dialog',
    description: 'Apply the changes introduced by this commit onto the current branch.',
  },
  revert: {
    title: 'Revert',
    confirm: 'Revert',
    testPrefix: 'revert-dialog',
    description: 'Create a new commit that undoes the changes introduced by this commit.',
  },
} as const;

export const SequencerCommitDialog: React.FC<SequencerCommitDialogProps> = ({
  action,
  commitSha,
  commitSubject,
  parents = [],
  parentSubjects = {},
  isOpen,
  onClose,
  onConfirm,
}) => {
  const labels = ACTION_LABELS[action];
  const isMergeCommit = parents.length >= 2;
  const [mainlineParent, setMainlineParent] = useState('1');
  const [noCommit, setNoCommit] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMainlineParent('1');
      setNoCommit(false);
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, commitSha, action]);

  const handleConfirm = () => {
    onConfirm(
      isMergeCommit ? Number(mainlineParent) : undefined,
      action === 'cherry-pick' && noCommit,
    );
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId={`${labels.testPrefix}-title`}
      overlayClassName={`${labels.testPrefix}-modal-overlay`}
      dialogClassName={`${labels.testPrefix}`}
      overlayTestId={`${labels.testPrefix}-overlay`}
      dialogTestId={`${labels.testPrefix}`}
    >
      <ModalTitle className={`${labels.testPrefix}-title`} id={`${labels.testPrefix}-title`}>
        {labels.title} commit <em>{commitSha.slice(0, 8)}</em>
      </ModalTitle>

      {commitSubject ? (
        <p className={`${labels.testPrefix}-subject`} data-testid={`${labels.testPrefix}-subject`}>
          {commitSubject}
        </p>
      ) : null}

      <p className={`${labels.testPrefix}-description`}>{labels.description}</p>

      {isMergeCommit ? (
        <ModalField
          rowClassName={`${labels.testPrefix}-field-row`}
          labelClassName={`${labels.testPrefix}-field-label`}
          labelTestId={`${labels.testPrefix}-mainline-label`}
          htmlFor={`${labels.testPrefix}-mainline-select`}
          label="Mainline parent:"
        >
          <div className={`${labels.testPrefix}-mainline-wrapper`}>
            <Select
              id={`${labels.testPrefix}-mainline-select`}
              className={`${labels.testPrefix}-select`}
              value={mainlineParent}
              onChange={(e) => setMainlineParent(e.target.value)}
              data-testid={`${labels.testPrefix}-mainline-select`}
              aria-label="Mainline parent"
              options={parents.map((parentSha, index) => ({
                value: String(index + 1),
                label: `Parent ${index + 1} (${parentSha.slice(0, 7)})${
                  parentSubjects[parentSha] ? ` — ${parentSubjects[parentSha]}` : ''
                }`,
              }))}
            />
            <span className={`${labels.testPrefix}-mainline-hint`}>
              The selected parent is treated as the mainline; changes from the other parents are
              applied.
            </span>
          </div>
        </ModalField>
      ) : null}

      {action === 'cherry-pick' ? (
        <div className={`${labels.testPrefix}-options`}>
          <CheckboxField
            labelClassName={`${labels.testPrefix}-checkbox-label`}
            labelTestId={`${labels.testPrefix}-no-commit-label`}
            checkboxClassName={`${labels.testPrefix}-checkbox`}
            checkboxTestId={`${labels.testPrefix}-no-commit-checkbox`}
            checked={noCommit}
            onChange={setNoCommit}
          >
            <span>Do not commit automatically (-n)</span>
          </CheckboxField>
        </div>
      ) : null}

      <ModalActions
        className={`${labels.testPrefix}-actions`}
        actions={[
          {
            text: labels.confirm,
            onClick: handleConfirm,
            testId: `${labels.testPrefix}-confirm-btn`,
            className: `${labels.testPrefix}-btn primary`,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: `${labels.testPrefix}-cancel-btn`,
            className: `${labels.testPrefix}-btn`,
          },
        ]}
      />
    </Modal>
  );
};
