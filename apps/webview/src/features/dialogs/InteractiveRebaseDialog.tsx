import React, { useCallback, useMemo, useRef } from 'react';
import { validateRebasePlan } from '@git-graph/shared';
import type { RebasePlanAction, RebasePlanEntry } from '@git-graph/shared';
import { Modal, ModalActions, ModalTitle } from '../../components/ui/Modal';
import { CheckboxField } from '../../components/ui/Checkbox';
import { Icon } from '../../components/ui/Icon';
import { Select } from '../../components/ui/Select';
import { TextInput } from '../../components/ui/TextInput';
import { useInteractiveRebaseStore } from '../../stores/interactiveRebaseStore';

export interface InteractiveRebaseDialogProps {
  onClose: () => void;
  onStart: (entries: RebasePlanEntry[], confirmedPublishedBranch: boolean) => void;
  onContinue: () => void;
  onAbort: () => void;
  onSkip: () => void;
}

const ACTION_OPTIONS: Array<{ value: RebasePlanAction; label: string }> = [
  { value: 'pick', label: 'Pick' },
  { value: 'reword', label: 'Reword' },
  { value: 'edit', label: 'Edit' },
  { value: 'squash', label: 'Squash' },
  { value: 'fixup', label: 'Fixup' },
  { value: 'drop', label: 'Drop' },
];

function isMergeAction(action: RebasePlanAction): boolean {
  return action === 'squash' || action === 'fixup';
}

export const InteractiveRebaseDialog: React.FC<InteractiveRebaseDialogProps> = ({
  onClose,
  onStart,
  onContinue,
  onAbort,
  onSkip,
}) => {
  const isOpen = useInteractiveRebaseStore((s) => s.isOpen);
  const entries = useInteractiveRebaseStore((s) => s.entries);
  const onto = useInteractiveRebaseStore((s) => s.onto);
  const status = useInteractiveRebaseStore((s) => s.status);
  const currentStep = useInteractiveRebaseStore((s) => s.currentStep);
  const totalSteps = useInteractiveRebaseStore((s) => s.totalSteps);
  const conflicts = useInteractiveRebaseStore((s) => s.conflicts);
  const error = useInteractiveRebaseStore((s) => s.error);
  const isPublished = useInteractiveRebaseStore((s) => s.isPublished);
  const upstream = useInteractiveRebaseStore((s) => s.upstream);
  const confirmedPublishedBranch = useInteractiveRebaseStore((s) => s.confirmedPublishedBranch);
  const setAction = useInteractiveRebaseStore((s) => s.setAction);
  const setMessage = useInteractiveRebaseStore((s) => s.setMessage);
  const setConfirmedPublishedBranch = useInteractiveRebaseStore(
    (s) => s.setConfirmedPublishedBranch,
  );
  const reorder = useInteractiveRebaseStore((s) => s.reorder);
  const dragIndexRef = useRef<number | null>(null);

  const executionEntries = useMemo(() => [...entries].reverse(), [entries]);
  const validation = useMemo(() => validateRebasePlan(executionEntries), [executionEntries]);
  const indentLevels = useMemo(() => {
    const levels = new Array<number>(entries.length).fill(0);
    let depth = 0;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      levels[index] = depth;
      const action = entries[index]!.action;
      if (isMergeAction(action)) {
        depth += 1;
      } else if (action !== 'drop') {
        depth = 0;
      }
    }
    return levels;
  }, [entries]);

  const isReadOnly = status !== 'ready';
  const isBusy = status === 'running' || status === 'aborting' || status === 'planning';
  const isInProgress = status === 'paused' || status === 'conflict';
  const canStart =
    status === 'ready' &&
    entries.length > 0 &&
    validation.valid &&
    (!isPublished || confirmedPublishedBranch);

  const handleStart = useCallback(() => {
    if (!canStart) {
      return;
    }
    onStart(entries, isPublished ? confirmedPublishedBranch : false);
  }, [canStart, entries, isPublished, confirmedPublishedBranch, onStart]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, index: number) => {
      if (isReadOnly) {
        return;
      }
      dragIndexRef.current = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    },
    [isReadOnly],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      if (isReadOnly) {
        return;
      }
      const transferred = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
      const fromIndex = Number.isInteger(transferred) ? transferred : dragIndexRef.current;
      dragIndexRef.current = null;
      if (fromIndex === null || !Number.isInteger(fromIndex)) {
        return;
      }
      reorder(fromIndex, index);
    },
    [isReadOnly, reorder],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  const actions = [];

  if (status === 'ready') {
    actions.push({
      text: 'Start Rebase',
      onClick: handleStart,
      testId: 'interactive-rebase-start-btn',
      className: 'rebase-dialog-btn primary',
      disabled: !canStart,
    });
  }

  if (isInProgress) {
    actions.push(
      {
        text: 'Continue',
        onClick: onContinue,
        testId: 'interactive-rebase-continue-btn',
        className: 'rebase-dialog-btn primary',
      },
      {
        text: 'Skip',
        onClick: onSkip,
        testId: 'interactive-rebase-skip-btn',
        className: 'rebase-dialog-btn',
      },
      {
        text: 'Abort',
        onClick: onAbort,
        testId: 'interactive-rebase-abort-btn',
        className: 'rebase-dialog-btn',
      },
    );
  }

  actions.push({
    text: isBusy ? 'Hide' : 'Close',
    onClick: onClose,
    testId: isBusy ? 'interactive-rebase-hide-btn' : 'interactive-rebase-close-btn',
    className: 'rebase-dialog-btn',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="interactive-rebase-dialog-title"
      overlayClassName="rebase-modal-overlay"
      dialogClassName="rebase-dialog interactive-rebase-dialog"
      overlayTestId="interactive-rebase-dialog-overlay"
      dialogTestId="interactive-rebase-dialog"
    >
      <ModalTitle className="rebase-dialog-title" id="interactive-rebase-dialog-title">
        Interactive Rebase onto <em>{onto ? onto.slice(0, 7) : 'target'}</em>
      </ModalTitle>

      {isPublished ? (
        <div
          className="rebase-dialog-warning"
          role="alert"
          data-testid="interactive-rebase-published-warning"
        >
          <Icon
            name="alert-circle"
            className="rebase-dialog-warning-icon"
            testId="interactive-rebase-warning-icon"
          />
          <div className="rebase-dialog-warning-text">
            <p>
              This branch{upstream ? ` tracks '${upstream}' and` : ''} appears to be published to a
              remote. Interactive rebase rewrites history and can disrupt collaborators.
            </p>
            <CheckboxField
              labelClassName="rebase-dialog-checkbox-label"
              labelTestId="interactive-rebase-risk-label"
              checkboxClassName="rebase-dialog-checkbox"
              checkboxTestId="interactive-rebase-risk-checkbox"
              checked={confirmedPublishedBranch}
              onChange={setConfirmedPublishedBranch}
              disabled={isReadOnly}
            >
              <span>I understand the risks of rewriting published history</span>
            </CheckboxField>
          </div>
        </div>
      ) : null}

      {status === 'planning' ? (
        <div className="interactive-rebase-loading" data-testid="interactive-rebase-loading">
          Loading commits...
        </div>
      ) : null}

      {status === 'failed' && error ? (
        <div
          className="interactive-rebase-error"
          role="alert"
          data-testid="interactive-rebase-error"
        >
          {error}
        </div>
      ) : null}

      {status === 'aborting' ? (
        <div className="interactive-rebase-loading" data-testid="interactive-rebase-aborting">
          Aborting interactive rebase...
        </div>
      ) : null}

      {status === 'completed' ? (
        <div
          className="interactive-rebase-success"
          role="status"
          data-testid="interactive-rebase-completed"
        >
          Interactive rebase completed.
        </div>
      ) : null}

      {status === 'aborted' ? (
        <div
          className="interactive-rebase-success"
          role="status"
          data-testid="interactive-rebase-aborted"
        >
          Interactive rebase aborted. The branch was restored.
        </div>
      ) : null}

      {isInProgress ? (
        <div
          className={
            status === 'conflict' ? 'interactive-rebase-conflict' : 'interactive-rebase-paused'
          }
          role="alert"
          data-testid="interactive-rebase-status"
        >
          <p>
            {status === 'conflict'
              ? 'Rebase stopped with conflicts. Resolve them, then continue, skip, or abort.'
              : 'Rebase paused at the selected commit. Amend or inspect the commit, then continue.'}
          </p>
          {conflicts.length > 0 ? (
            <ul className="interactive-rebase-conflicts">
              {conflicts.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="interactive-rebase-status-detail">{error}</p> : null}
        </div>
      ) : null}

      {totalSteps > 0 && (status === 'running' || isInProgress) ? (
        <div className="interactive-rebase-progress" data-testid="interactive-rebase-progress">
          <div className="interactive-rebase-progress-track">
            <div
              className="interactive-rebase-progress-fill"
              style={{
                width: `${Math.min(100, Math.round((currentStep / totalSteps) * 100))}%`,
              }}
            />
          </div>
          <span className="interactive-rebase-progress-label">
            Step {Math.min(currentStep, totalSteps)} / {totalSteps}
          </span>
        </div>
      ) : null}

      {status === 'ready' && entries.length === 0 ? (
        <div className="interactive-rebase-loading" data-testid="interactive-rebase-empty">
          No commits to rebase.
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="interactive-rebase-plan" data-testid="interactive-rebase-plan">
          {entries.map((entry, index) => (
            <div
              key={entry.sha}
              className={[
                'rebase-plan-row',
                entry.action === 'drop' ? 'is-dropped' : '',
                isMergeAction(entry.action) ? 'is-merge' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ marginLeft: `${Math.min(4, indentLevels[index] ?? 0) * 16}px` }}
              draggable={!isReadOnly}
              onDragStart={(event) => handleDragStart(event, index)}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={handleDragEnd}
              data-testid={`interactive-rebase-row-${index}`}
            >
              <div className="rebase-plan-reorder">
                <button
                  type="button"
                  className="interactive-rebase-move-btn"
                  onClick={() => reorder(index, index - 1)}
                  disabled={isReadOnly || index === 0}
                  aria-label={`Move commit ${entry.shortSha} up`}
                  data-testid={`interactive-rebase-up-${index}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="interactive-rebase-move-btn"
                  onClick={() => reorder(index, index + 1)}
                  disabled={isReadOnly || index === entries.length - 1}
                  aria-label={`Move commit ${entry.shortSha} down`}
                  data-testid={`interactive-rebase-down-${index}`}
                >
                  ↓
                </button>
              </div>

              <Select
                className="select-control interactive-rebase-action-select"
                options={ACTION_OPTIONS}
                value={entry.action}
                onChange={(event) => setAction(index, event.target.value as RebasePlanAction)}
                disabled={isReadOnly}
                aria-label={`Action for ${entry.shortSha}`}
                data-testid={`interactive-rebase-action-${index}`}
              />

              <div className="rebase-plan-commit">
                <span className="rebase-plan-sha">{entry.shortSha}</span>
                <span className="rebase-plan-subject">{entry.subject}</span>
                <span className="rebase-plan-author">{entry.author}</span>
              </div>

              {entry.action === 'reword' ? (
                <TextInput
                  className="interactive-rebase-message-input"
                  value={entry.message ?? entry.subject}
                  onChange={(event) => setMessage(index, event.target.value)}
                  readOnly={isReadOnly}
                  aria-label={`New message for ${entry.shortSha}`}
                  data-testid={`interactive-rebase-message-${index}`}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {status === 'ready' && !validation.valid && entries.length > 0 ? (
        <div className="interactive-rebase-validation" role="alert">
          {validation.error}
        </div>
      ) : null}

      <ModalActions className="rebase-dialog-actions" actions={actions} />
    </Modal>
  );
};
