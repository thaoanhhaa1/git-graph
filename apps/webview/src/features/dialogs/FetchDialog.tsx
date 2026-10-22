import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RemoteInfo } from '@git-graph/shared';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';

export interface FetchDialogOptions {
  remote?: string;
  prune: boolean;
  all: boolean;
}

export interface FetchDialogProps {
  isOpen: boolean;
  remotes: RemoteInfo[];
  defaultRemote?: string;
  progress?: number;
  progressMessage?: string;
  isRunning?: boolean;
  error?: string | null;
  onClose: () => void;
  onFetch: (options: FetchDialogOptions) => void;
}

export const FetchDialog: React.FC<FetchDialogProps> = ({
  isOpen,
  remotes,
  defaultRemote,
  progress = 0,
  progressMessage,
  isRunning = false,
  error,
  onClose,
  onFetch,
}) => {
  const [remote, setRemote] = useState('');
  const [prune, setPrune] = useState(true);
  const [all, setAll] = useState(false);
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
    setPrune(true);
    setAll(remotes.length === 0);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [isOpen, defaultRemote, remotes]);

  const canSubmit = !isRunning && (all || Boolean(remote));
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));

  const handleConfirm = () => {
    if (!canSubmit) {
      return;
    }
    onFetch({
      ...(!all && remote ? { remote } : {}),
      prune,
      all,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="fetch-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog fetch-dialog"
      overlayTestId="fetch-dialog-overlay"
      dialogTestId="fetch-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="fetch-dialog-title">
        Fetch from Remote
      </ModalTitle>

      <ModalField
        rowClassName="sync-dialog-field-row"
        labelClassName="sync-dialog-field-label"
        labelTestId="fetch-dialog-remote-label"
        htmlFor="fetch-dialog-remote"
        label="Remote:"
      >
        <Select
          id="fetch-dialog-remote"
          className="sync-dialog-select"
          options={remoteOptions}
          value={remote}
          onChange={(event) => setRemote(event.target.value)}
          disabled={all || remotes.length === 0 || isRunning}
          data-testid="fetch-dialog-remote"
        />
      </ModalField>

      <div className="sync-dialog-options">
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="fetch-dialog-prune-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="fetch-dialog-prune-checkbox"
          checked={prune}
          onChange={setPrune}
          disabled={isRunning}
        >
          <span>Prune deleted remote-tracking branches (--prune)</span>
        </CheckboxField>
        <CheckboxField
          labelClassName="sync-dialog-checkbox-label"
          labelTestId="fetch-dialog-all-label"
          checkboxClassName="sync-dialog-checkbox"
          checkboxTestId="fetch-dialog-all-checkbox"
          checked={all}
          onChange={setAll}
          disabled={isRunning}
        >
          <span>Fetch all remotes (--all)</span>
        </CheckboxField>
      </div>

      {(isRunning || progress > 0) && (
        <div className="sync-dialog-progress" data-testid="fetch-dialog-progress">
          <div
            className="sync-dialog-progress-track"
            role="progressbar"
            aria-label="Fetch progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={progressMessage || `${percent}%`}
          >
            <div className="sync-dialog-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="sync-dialog-progress-text" aria-live="polite" aria-atomic="true">
            {progressMessage || (percent >= 100 ? 'Fetch complete' : `Fetching... ${percent}%`)}
          </span>
        </div>
      )}

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="fetch-dialog-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: isRunning ? 'Fetching...' : 'Fetch',
            onClick: handleConfirm,
            testId: 'fetch-dialog-confirm-btn',
            className: 'sync-dialog-btn primary',
            disabled: !canSubmit,
            ref: confirmBtnRef,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'fetch-dialog-cancel-btn',
            className: 'sync-dialog-btn',
          },
        ]}
      />
    </Modal>
  );
};
