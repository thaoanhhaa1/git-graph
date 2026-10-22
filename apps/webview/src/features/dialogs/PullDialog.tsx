import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OperationPullStrategy, RemoteInfo } from '@git-graph/shared';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Select } from '../../components/ui/Select';
import { TextInput } from '../../components/ui/TextInput';

export interface PullDialogOptions {
  remote?: string;
  branch?: string;
  strategy: OperationPullStrategy;
  autostash: boolean;
}

export interface PullDialogProps {
  isOpen: boolean;
  currentBranch?: string;
  remotes: RemoteInfo[];
  defaultRemote?: string;
  defaultBranch?: string;
  progress?: number;
  progressMessage?: string;
  isRunning?: boolean;
  error?: string | null;
  onClose: () => void;
  onPull: (options: PullDialogOptions) => void;
}

export const PullDialog: React.FC<PullDialogProps> = ({
  isOpen,
  currentBranch,
  remotes,
  defaultRemote,
  defaultBranch,
  progress = 0,
  progressMessage,
  isRunning = false,
  error,
  onClose,
  onPull,
}) => {
  const [remote, setRemote] = useState('');
  const [branch, setBranch] = useState('');
  const [strategy, setStrategy] = useState<OperationPullStrategy>('merge');
  const [autostash, setAutostash] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const remoteOptions = useMemo(
    () => remotes.map((item) => ({ value: item.name, label: item.name })),
    [remotes],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const resolvedRemote =
      defaultRemote && remotes.some((item) => item.name === defaultRemote)
        ? defaultRemote
        : (remotes[0]?.name ?? '');
    setRemote(resolvedRemote);
    setBranch(defaultBranch || currentBranch || '');
    setStrategy('merge');
    setAutostash(false);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [isOpen, defaultRemote, defaultBranch, currentBranch, remotes]);

  const canSubmit = !isRunning && remotes.length > 0 && Boolean(remote) && Boolean(branch.trim());
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const targetBranch = currentBranch || 'current branch';

  const handleConfirm = () => {
    if (!canSubmit) {
      return;
    }
    onPull({
      remote,
      branch: branch.trim(),
      strategy,
      autostash,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="pull-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog pull-dialog"
      overlayTestId="pull-dialog-overlay"
      dialogTestId="pull-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="pull-dialog-title">
        Pull into <em>{targetBranch}</em>
      </ModalTitle>

      <p className="sync-dialog-description" data-testid="pull-dialog-description">
        Pull from <strong>{remote || 'remote'}</strong>
        {branch.trim() ? (
          <>
            /<strong>{branch.trim()}</strong>
          </>
        ) : null}{' '}
        into <strong>{targetBranch}</strong>.
      </p>

      <div className="sync-dialog-fields">
        <ModalField
          rowClassName="sync-dialog-field-row"
          labelClassName="sync-dialog-field-label"
          labelTestId="pull-dialog-remote-label"
          htmlFor="pull-dialog-remote"
          label="Remote:"
        >
          <Select
            id="pull-dialog-remote"
            className="sync-dialog-select"
            options={remoteOptions}
            value={remote}
            onChange={(event) => setRemote(event.target.value)}
            disabled={remotes.length === 0 || isRunning}
            data-testid="pull-dialog-remote"
          />
        </ModalField>
        <ModalField
          rowClassName="sync-dialog-field-row"
          labelClassName="sync-dialog-field-label"
          labelTestId="pull-dialog-branch-label"
          htmlFor="pull-dialog-branch"
          label="Remote branch:"
        >
          <TextInput
            id="pull-dialog-branch"
            className="sync-dialog-input"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            disabled={isRunning}
            spellCheck={false}
            data-testid="pull-dialog-branch"
          />
        </ModalField>
      </div>

      <div className="sync-dialog-section">
        <span className="sync-dialog-section-title">Strategy</span>
        <div className="sync-dialog-radio-group">
          <RadioGroup
            name="pull-strategy"
            value={strategy}
            onChange={(value) => setStrategy(value as OperationPullStrategy)}
            itemClassName="sync-dialog-radio-label"
            options={[
              {
                value: 'merge',
                label: 'Merge (default)',
                testId: 'pull-dialog-strategy-merge',
              },
              {
                value: 'rebase',
                label: 'Rebase (--rebase)',
                testId: 'pull-dialog-strategy-rebase',
              },
              {
                value: 'ff-only',
                label: 'Fast-Forward Only (--ff-only)',
                testId: 'pull-dialog-strategy-ff-only',
              },
            ]}
          />
        </div>
      </div>

      <div className="sync-dialog-options">
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="pull-dialog-autostash-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="pull-dialog-autostash-checkbox"
          checked={autostash}
          onChange={setAutostash}
          disabled={isRunning}
        >
          <span>Automatically stash changes before pulling (--autostash)</span>
        </CheckboxField>
      </div>

      {(isRunning || progress > 0) && (
        <div className="sync-dialog-progress" data-testid="pull-dialog-progress">
          <div
            className="sync-dialog-progress-track"
            role="progressbar"
            aria-label="Pull progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={progressMessage || `${percent}%`}
          >
            <div className="sync-dialog-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="sync-dialog-progress-text" aria-live="polite" aria-atomic="true">
            {progressMessage || (percent >= 100 ? 'Pull complete' : `Pulling... ${percent}%`)}
          </span>
        </div>
      )}

      {remotes.length === 0 ? (
        <div className="sync-dialog-error" role="alert" data-testid="pull-dialog-no-remotes">
          No remote repositories are configured.
        </div>
      ) : null}

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="pull-dialog-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: isRunning ? 'Pulling...' : 'Pull',
            onClick: handleConfirm,
            testId: 'pull-dialog-confirm-btn',
            className: 'sync-dialog-btn primary',
            disabled: !canSubmit,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'pull-dialog-cancel-btn',
            className: 'sync-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
