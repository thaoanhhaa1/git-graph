import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorktreeFileChange, WorktreeFileStatusCode } from '@git-graph/shared';
import { useWorktreeStore } from '../../stores/worktreeStore';
import {
  openDiffInVsCode,
  requestCreateCommit,
  requestDiscardWorktree,
  requestStageWorktree,
  requestUnstageWorktree,
  requestWorktreeStatus,
} from '../../messaging/messageRouter';
import { Button } from '../../components/ui/Button';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { TextInput } from '../../components/ui/TextInput';

export interface UncommittedChangesPanelProps {
  repositoryId?: string;
  onClose: () => void;
  onStash?: () => void;
}

interface StatusInfo {
  code: string;
  label: string;
}

const STATUS_INFO: Record<WorktreeFileStatusCode, StatusInfo> = {
  added: { code: 'A', label: 'Added' },
  modified: { code: 'M', label: 'Modified' },
  deleted: { code: 'D', label: 'Deleted' },
  renamed: { code: 'R', label: 'Renamed' },
  copied: { code: 'C', label: 'Copied' },
  typeChanged: { code: 'T', label: 'Type changed' },
  unmerged: { code: 'U', label: 'Unmerged' },
  untracked: { code: 'U', label: 'Untracked' },
  unknown: { code: '?', label: 'Unknown' },
};

interface DiscardRequest {
  paths: string[];
  all: boolean;
}

interface FileRowProps {
  file: WorktreeFileChange;
  staged: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenDiff: (file: WorktreeFileChange, staged: boolean) => void;
}

const FileRow: React.FC<FileRowProps> = React.memo(
  ({ file, staged, onStage, onUnstage, onDiscard, onOpenDiff }) => {
    const info = STATUS_INFO[file.status];
    const displayPath = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;

    const handleStage = useCallback(() => onStage(file.path), [onStage, file.path]);
    const handleUnstage = useCallback(() => onUnstage(file.path), [onUnstage, file.path]);
    const handleDiscard = useCallback(() => onDiscard(file.path), [onDiscard, file.path]);
    const handleOpenDiff = useCallback(() => onOpenDiff(file, staged), [onOpenDiff, file, staged]);

    return (
      <div
        className="worktree-file-row"
        data-testid={`worktree-file-${staged ? 'staged' : 'unstaged'}-${file.path}`}
        role="listitem"
      >
        <span
          className={`worktree-file-status status-${file.status}`}
          title={info.label}
          aria-label={info.label}
        >
          {info.code}
        </span>
        <button
          type="button"
          className="worktree-file-path"
          onClick={handleOpenDiff}
          title={`Open diff for ${file.path}`}
          data-testid={`worktree-file-open-diff-${file.path}`}
        >
          {displayPath}
        </button>
        <span className="worktree-file-actions">
          {staged ? (
            <Button
              variant="icon"
              className="worktree-file-action-btn"
              title="Unstage file"
              aria-label={`Unstage ${file.path}`}
              onClick={handleUnstage}
              data-testid={`worktree-unstage-${file.path}`}
            >
              <Icon name="minus" size={13} />
            </Button>
          ) : (
            <Button
              variant="icon"
              className="worktree-file-action-btn"
              title="Stage file"
              aria-label={`Stage ${file.path}`}
              onClick={handleStage}
              data-testid={`worktree-stage-${file.path}`}
            >
              <Icon name="plus" size={13} />
            </Button>
          )}
          <Button
            variant="icon"
            className="worktree-file-action-btn danger"
            title="Discard changes"
            aria-label={`Discard changes in ${file.path}`}
            onClick={handleDiscard}
            data-testid={`worktree-discard-${file.path}`}
          >
            <Icon name="trash" size={13} />
          </Button>
          <Button
            variant="icon"
            className="worktree-file-action-btn"
            title="Open diff"
            aria-label={`Open diff for ${file.path}`}
            onClick={handleOpenDiff}
            data-testid={`worktree-open-diff-${file.path}`}
          >
            <Icon name="file" size={13} />
          </Button>
        </span>
      </div>
    );
  },
);

FileRow.displayName = 'FileRow';

const FileSection: React.FC<{
  title: string;
  testId: string;
  files: WorktreeFileChange[];
  staged: boolean;
  emptyText: string;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenDiff: (file: WorktreeFileChange, staged: boolean) => void;
}> = ({ title, testId, files, staged, emptyText, onStage, onUnstage, onDiscard, onOpenDiff }) => (
  <section className="worktree-section" data-testid={testId}>
    <header className="worktree-section-header">
      <span className="worktree-section-title">{title}</span>
      <span className="worktree-section-count" data-testid={`${testId}-count`}>
        {files.length}
      </span>
    </header>
    {files.length === 0 ? (
      <p className="worktree-section-empty">{emptyText}</p>
    ) : (
      <div className="worktree-file-list" role="list">
        {files.map((file) => (
          <FileRow
            key={`${staged ? 'staged' : 'unstaged'}-${file.path}`}
            file={file}
            staged={staged}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onOpenDiff={onOpenDiff}
          />
        ))}
      </div>
    )}
  </section>
);

export const UncommittedChangesPanel: React.FC<UncommittedChangesPanelProps> = ({
  repositoryId,
  onClose,
  onStash,
}) => {
  const status = useWorktreeStore((s) => s.status);
  const isLoading = useWorktreeStore((s) => s.isLoading);
  const error = useWorktreeStore((s) => s.error);

  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null);

  useEffect(() => {
    if (repositoryId) {
      requestWorktreeStatus(repositoryId);
    }
  }, [repositoryId]);

  const staged = useMemo(() => status?.staged ?? [], [status?.staged]);
  const unstaged = useMemo(() => status?.unstaged ?? [], [status?.unstaged]);

  const handleAmendChange = useCallback(
    (checked: boolean) => {
      setAmend(checked);
      if (checked && status?.head) {
        setSummary(status.head.subject);
        setDescription(status.head.body);
      } else if (!checked) {
        setSummary('');
        setDescription('');
      }
    },
    [status?.head],
  );

  const handleStage = useCallback(
    (path: string) => {
      if (repositoryId) {
        requestStageWorktree({ repositoryId, paths: [path] });
      }
    },
    [repositoryId],
  );

  const handleUnstage = useCallback(
    (path: string) => {
      if (repositoryId) {
        requestUnstageWorktree({ repositoryId, paths: [path] });
      }
    },
    [repositoryId],
  );

  const handleDiscard = useCallback((path: string) => {
    setDiscardRequest({ paths: [path], all: false });
  }, []);

  const handleOpenDiff = useCallback(
    (file: WorktreeFileChange, isStaged: boolean) => {
      if (!repositoryId) {
        return;
      }
      openDiffInVsCode(repositoryId, '*', file.path, undefined, file.oldPath, isStaged);
    },
    [repositoryId],
  );

  const handleStageAll = useCallback(() => {
    if (repositoryId) {
      requestStageWorktree({ repositoryId, paths: [], all: true });
    }
  }, [repositoryId]);

  const handleUnstageAll = useCallback(() => {
    if (repositoryId) {
      requestUnstageWorktree({ repositoryId, paths: [], all: true });
    }
  }, [repositoryId]);

  const handleDiscardAll = useCallback(() => {
    setDiscardRequest({ paths: [], all: true });
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!repositoryId || !discardRequest) {
      return;
    }
    requestDiscardWorktree({
      repositoryId,
      paths: discardRequest.paths,
      all: discardRequest.all,
      untracked: true,
      noConfirm: true,
    });
    setDiscardRequest(null);
  }, [repositoryId, discardRequest]);

  const handleCommit = useCallback(() => {
    if (!repositoryId) {
      return;
    }
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      return;
    }
    requestCreateCommit({
      repositoryId,
      message: trimmedSummary,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(amend ? { amend: true } : {}),
    });
    setSummary('');
    setDescription('');
    setAmend(false);
  }, [repositoryId, summary, description, amend]);

  const canCommit =
    summary.trim().length > 0 && (amend || staged.length > 0) && !status?.hasConflicts;

  return (
    <aside
      className="commit-details-panel uncommitted-changes-panel"
      data-testid="uncommitted-changes-panel"
      role="region"
      aria-label="Uncommitted Changes Panel"
    >
      <div className="commit-details-main-layout">
        <div className="commit-details-left-section uncommitted-left-section">
          <div className="uncommitted-header">
            <h2 className="uncommitted-title">
              Uncommitted Changes
              {status?.currentBranch ? (
                <span className="uncommitted-branch">on {status.currentBranch}</span>
              ) : null}
            </h2>
            <div className="uncommitted-header-actions">
              <Button
                variant="secondary"
                className="uncommitted-bulk-btn"
                onClick={handleStageAll}
                disabled={unstaged.length === 0}
                data-testid="worktree-stage-all-btn"
              >
                Stage All
              </Button>
              <Button
                variant="secondary"
                className="uncommitted-bulk-btn"
                onClick={handleUnstageAll}
                disabled={staged.length === 0}
                data-testid="worktree-unstage-all-btn"
              >
                Unstage All
              </Button>
              <Button
                variant="secondary"
                className="uncommitted-bulk-btn danger"
                onClick={handleDiscardAll}
                disabled={staged.length === 0 && unstaged.length === 0}
                data-testid="worktree-discard-all-btn"
              >
                Discard All
              </Button>
              {onStash ? (
                <Button
                  variant="secondary"
                  className="uncommitted-bulk-btn"
                  onClick={onStash}
                  disabled={staged.length === 0 && unstaged.length === 0}
                  data-testid="worktree-stash-btn"
                >
                  <Icon name="stash" size={13} /> Stash
                </Button>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div
              className="commit-details-loading"
              data-testid="uncommitted-loading"
              role="status"
              aria-live="polite"
            >
              <span className="loading-spinner" />
              <span>Loading working tree status...</span>
            </div>
          ) : error ? (
            <div className="commit-details-error" role="alert">
              <p className="error-title">Failed to load working tree status</p>
              <p className="error-message">{error}</p>
            </div>
          ) : status?.isClean ? (
            <div className="commit-details-empty" data-testid="uncommitted-clean">
              The working tree is clean. There are no changes to commit.
            </div>
          ) : (
            <>
              <FileSection
                title="Staged Changes"
                testId="worktree-staged-section"
                files={staged}
                staged
                emptyText="No staged changes."
                onStage={handleStage}
                onUnstage={handleUnstage}
                onDiscard={handleDiscard}
                onOpenDiff={handleOpenDiff}
              />
              <FileSection
                title="Changes (Unstaged)"
                testId="worktree-unstaged-section"
                files={unstaged}
                staged={false}
                emptyText="No unstaged changes."
                onStage={handleStage}
                onUnstage={handleUnstage}
                onDiscard={handleDiscard}
                onOpenDiff={handleOpenDiff}
              />

              <form
                className="uncommitted-commit-form"
                data-testid="uncommitted-commit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canCommit) {
                    handleCommit();
                  }
                }}
              >
                <h3 className="uncommitted-commit-title">Commit</h3>
                <TextInput
                  className="uncommitted-commit-summary"
                  placeholder="Commit summary"
                  aria-label="Commit summary"
                  value={summary}
                  maxLength={72}
                  onChange={(e) => setSummary(e.target.value)}
                  data-testid="uncommitted-commit-summary"
                />
                <textarea
                  className="uncommitted-commit-description"
                  placeholder="Description (optional)"
                  aria-label="Commit description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="uncommitted-commit-description"
                />
                <CheckboxField
                  labelClassName="uncommitted-commit-amend-label"
                  labelTestId="uncommitted-amend-label"
                  checkboxClassName="uncommitted-commit-amend-checkbox"
                  checkboxTestId="uncommitted-amend-checkbox"
                  checked={amend}
                  onChange={handleAmendChange}
                >
                  <span>Amend previous commit</span>
                </CheckboxField>
                <Button
                  type="submit"
                  variant="primary"
                  className="uncommitted-commit-btn"
                  disabled={!canCommit}
                  data-testid="uncommitted-commit-btn"
                >
                  <Icon name="commit" size={13} />
                  {amend ? 'Amend Commit' : 'Commit Changes'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="commit-details-vertical-toolbar">
        <Button
          variant="icon"
          className="details-toolbar-icon-btn close-btn"
          onClick={onClose}
          title="Close uncommitted changes (Esc)"
          aria-label="Close uncommitted changes"
          data-testid="close-uncommitted-button"
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <Modal
        isOpen={discardRequest !== null}
        onClose={() => setDiscardRequest(null)}
        onConfirm={confirmDiscard}
        titleId="discard-dialog-title"
        overlayClassName="discard-modal-overlay"
        dialogClassName="discard-dialog"
        overlayTestId="discard-dialog-overlay"
        dialogTestId="discard-dialog"
      >
        <ModalTitle className="discard-dialog-title" id="discard-dialog-title">
          Discard changes?
        </ModalTitle>
        <p className="discard-dialog-message">
          {discardRequest?.all
            ? 'This permanently discards all staged and unstaged changes, including untracked files.'
            : `This permanently discards changes in ${discardRequest?.paths[0] ?? ''}.`}
        </p>
        <ModalActions
          className="discard-dialog-actions"
          actions={[
            {
              text: 'Discard',
              onClick: confirmDiscard,
              testId: 'discard-dialog-confirm-btn',
              className: 'discard-dialog-btn primary danger',
            },
            {
              text: 'Cancel',
              onClick: () => setDiscardRequest(null),
              testId: 'discard-dialog-cancel-btn',
              className: 'discard-dialog-btn',
            },
          ]}
        />
      </Modal>
    </aside>
  );
};
