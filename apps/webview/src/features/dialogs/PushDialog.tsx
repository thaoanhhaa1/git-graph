import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RemoteInfo } from '@git-graph/shared';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';

export interface PushDialogOptions {
  remote: string;
  branchName: string;
  forceWithLease: boolean;
  setUpstream: boolean;
  tags: boolean;
}

export interface PushDialogProps {
  isOpen: boolean;
  branchName?: string;
  currentBranch?: string;
  remotes: RemoteInfo[];
  defaultRemote?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  progress?: number;
  progressMessage?: string;
  isRunning?: boolean;
  error?: string | null;
  onClose: () => void;
  onPush: (options: PushDialogOptions) => void;
}

export const PushDialog: React.FC<PushDialogProps> = ({
  isOpen,
  branchName,
  currentBranch,
  remotes,
  defaultRemote,
  upstream,
  ahead = 0,
  behind = 0,
  progress = 0,
  progressMessage,
  isRunning = false,
  error,
  onClose,
  onPush,
}) => {
  const [remote, setRemote] = useState('');
  const [forceWithLease, setForceWithLease] = useState(false);
  const [setUpstream, setSetUpstream] = useState(false);
  const [tags, setTags] = useState(false);
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
    setForceWithLease(false);
    setSetUpstream(!upstream);
    setTags(false);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [isOpen, defaultRemote, upstream, remotes]);

  const targetBranch = branchName ?? currentBranch;
  const canSubmit = !isRunning && Boolean(targetBranch) && remotes.length > 0 && Boolean(remote);
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));

  const handleConfirm = () => {
    if (!canSubmit || !targetBranch) {
      return;
    }
    onPush({
      remote,
      branchName: targetBranch,
      forceWithLease,
      setUpstream,
      tags,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="push-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog push-dialog"
      overlayTestId="push-dialog-overlay"
      dialogTestId="push-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="push-dialog-title">
        Push <em>{targetBranch || 'current branch'}</em> to <em>{remote || 'remote'}</em>
      </ModalTitle>

      <div className="push-dialog-sync-status" data-testid="push-dialog-sync-status">
        <span className="push-dialog-sync-ahead">↑ {ahead} ahead</span>
        <span className="push-dialog-sync-behind">↓ {behind} behind</span>
        {upstream ? <span className="push-dialog-sync-upstream">upstream: {upstream}</span> : null}
      </div>

      <ModalField
        rowClassName="sync-dialog-field-row"
        labelClassName="sync-dialog-field-label"
        labelTestId="push-dialog-remote-label"
        htmlFor="push-dialog-remote"
        label="Remote:"
      >
        <Select
          id="push-dialog-remote"
          className="sync-dialog-select"
          options={remoteOptions}
          value={remote}
          onChange={(event) => setRemote(event.target.value)}
          disabled={remotes.length === 0 || isRunning}
          data-testid="push-dialog-remote"
        />
      </ModalField>

      <div className="sync-dialog-options">
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="push-dialog-set-upstream-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="push-dialog-set-upstream-checkbox"
          checked={setUpstream}
          onChange={setSetUpstream}
          disabled={isRunning}
        >
          <span>Set upstream (-u)</span>
        </CheckboxField>
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="push-dialog-tags-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="push-dialog-tags-checkbox"
          checked={tags}
          onChange={setTags}
          disabled={isRunning}
        >
          <span>Push tags (--tags)</span>
        </CheckboxField>
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="push-dialog-force-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="push-dialog-force-checkbox"
          checked={forceWithLease}
          onChange={setForceWithLease}
          disabled={isRunning}
        >
          <span>Force with lease (--force-with-lease)</span>
        </CheckboxField>
      </div>

      {forceWithLease ? (
        <div className="sync-dialog-danger" role="alert" data-testid="push-dialog-force-warning">
          This rewrites remote history. Use only when you are sure nobody else pushed to this
          branch.
        </div>
      ) : null}

      {(isRunning || progress > 0) && (
        <div className="sync-dialog-progress" data-testid="push-dialog-progress">
          <div
            className="sync-dialog-progress-track"
            role="progressbar"
            aria-label="Push progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={progressMessage || `${percent}%`}
          >
            <div className="sync-dialog-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="sync-dialog-progress-text" aria-live="polite" aria-atomic="true">
            {progressMessage || (percent >= 100 ? 'Push complete' : `Pushing... ${percent}%`)}
          </span>
        </div>
      )}

      {!targetBranch || remotes.length === 0 ? (
        <div className="sync-dialog-error" role="alert" data-testid="push-dialog-unavailable">
          {!targetBranch
            ? 'Push requires a checked-out branch.'
            : 'No remote repositories are configured.'}
        </div>
      ) : null}

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="push-dialog-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: isRunning ? 'Pushing...' : 'Push',
            onClick: handleConfirm,
            testId: 'push-dialog-confirm-btn',
            className: `sync-dialog-btn primary ${forceWithLease ? 'danger' : ''}`,
            disabled: !canSubmit,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'push-dialog-cancel-btn',
            className: 'sync-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
