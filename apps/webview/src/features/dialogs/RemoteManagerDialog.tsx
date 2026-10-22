import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RemoteInfo } from '@git-graph/shared';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';

export interface RemoteManagerDialogProps {
  isOpen: boolean;
  remotes: RemoteInfo[];
  isLoading?: boolean;
  error?: string | null;
  isRunning?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAdd: (name: string, url: string) => void;
  onRemove: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onSetUrl: (name: string, url: string, push?: boolean) => void;
}

const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function validateRemoteName(name: string): string | null {
  if (!name) {
    return 'Remote name is required.';
  }
  if (!REMOTE_NAME_PATTERN.test(name)) {
    return 'Remote names must start with a letter or number and contain only letters, numbers, dots, dashes, underscores, or slashes.';
  }
  return null;
}

export const RemoteManagerDialog: React.FC<RemoteManagerDialogProps> = ({
  isOpen,
  remotes,
  isLoading = false,
  error,
  isRunning = false,
  onClose,
  onRefresh,
  onAdd,
  onRemove,
  onRename,
  onSetUrl,
}) => {
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editFetchUrl, setEditFetchUrl] = useState('');
  const [editPushUrl, setEditPushUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [removingName, setRemovingName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const sortedRemotes = useMemo(
    () => [...remotes].sort((a, b) => a.name.localeCompare(b.name)),
    [remotes],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setAddName('');
    setAddUrl('');
    setAddError(null);
    setEditingName(null);
    setRenamingName(null);
    setRemovingName(null);
    onRefresh();
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [isOpen, onRefresh]);

  useEffect(() => {
    if (editingName && !remotes.some((remote) => remote.name === editingName)) {
      setEditingName(null);
    }
    if (renamingName && !remotes.some((remote) => remote.name === renamingName)) {
      setRenamingName(null);
    }
    if (removingName && !remotes.some((remote) => remote.name === removingName)) {
      setRemovingName(null);
    }
  }, [remotes, editingName, renamingName, removingName]);

  const handleAdd = () => {
    const name = addName.trim();
    const url = addUrl.trim();
    const nameError = validateRemoteName(name);
    if (nameError) {
      setAddError(nameError);
      return;
    }
    if (remotes.some((remote) => remote.name === name)) {
      setAddError(`A remote named '${name}' already exists.`);
      return;
    }
    if (!url) {
      setAddError('Remote URL is required.');
      return;
    }
    setAddError(null);
    onAdd(name, url);
    setAddName('');
    setAddUrl('');
  };

  const startEdit = (remote: RemoteInfo) => {
    setEditingName(remote.name);
    setEditFetchUrl(remote.fetchUrl);
    setEditPushUrl(remote.pushUrl);
    setEditError(null);
    setRenamingName(null);
    setRemovingName(null);
  };

  const handleSaveUrls = (remote: RemoteInfo) => {
    const fetchUrl = editFetchUrl.trim();
    const pushUrl = editPushUrl.trim();
    if (!fetchUrl || !pushUrl) {
      setEditError('Fetch and push URLs are required.');
      return;
    }
    setEditError(null);
    if (fetchUrl !== remote.fetchUrl) {
      onSetUrl(remote.name, fetchUrl, false);
    }
    if (pushUrl !== remote.pushUrl) {
      onSetUrl(remote.name, pushUrl, true);
    }
    setEditingName(null);
  };

  const startRename = (remote: RemoteInfo) => {
    setRenamingName(remote.name);
    setRenameValue(remote.name);
    setRenameError(null);
    setEditingName(null);
    setRemovingName(null);
  };

  const handleRename = (remote: RemoteInfo) => {
    const newName = renameValue.trim();
    const nameError = validateRemoteName(newName);
    if (nameError) {
      setRenameError(nameError);
      return;
    }
    if (newName === remote.name) {
      setRenameError('Enter a different remote name.');
      return;
    }
    if (remotes.some((item) => item.name === newName)) {
      setRenameError(`A remote named '${newName}' already exists.`);
      return;
    }
    setRenameError(null);
    onRename(remote.name, newName);
    setRenamingName(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="remote-manager-dialog-title"
      overlayClassName="sync-dialog-modal-overlay"
      dialogClassName="sync-dialog remote-manager-dialog"
      overlayTestId="remote-manager-dialog-overlay"
      dialogTestId="remote-manager-dialog"
    >
      <ModalTitle className="sync-dialog-title" id="remote-manager-dialog-title">
        Manage Remotes
      </ModalTitle>

      <div className="remote-manager-list" data-testid="remote-manager-list">
        {isLoading && remotes.length === 0 ? (
          <p className="sync-dialog-muted" data-testid="remote-manager-loading">
            Loading remotes...
          </p>
        ) : sortedRemotes.length === 0 ? (
          <p className="sync-dialog-muted" data-testid="remote-manager-empty">
            No remotes configured.
          </p>
        ) : (
          sortedRemotes.map((remote) => (
            <div
              className="remote-manager-row"
              data-testid={`remote-manager-row-${remote.name}`}
              key={remote.name}
            >
              <div className="remote-manager-row-main">
                <strong className="remote-manager-name">{remote.name}</strong>
                <span className="remote-manager-url" title={remote.fetchUrl}>
                  fetch: {remote.fetchUrl}
                </span>
                <span className="remote-manager-url" title={remote.pushUrl}>
                  push: {remote.pushUrl}
                </span>
              </div>
              <div className="remote-manager-row-actions">
                <Button
                  className="remote-manager-action-btn"
                  onClick={() => startEdit(remote)}
                  disabled={isRunning}
                  data-testid={`remote-manager-edit-${remote.name}`}
                >
                  Edit URL
                </Button>
                <Button
                  className="remote-manager-action-btn"
                  onClick={() => startRename(remote)}
                  disabled={isRunning}
                  data-testid={`remote-manager-rename-${remote.name}`}
                >
                  Rename
                </Button>
                <Button
                  className="remote-manager-action-btn danger"
                  onClick={() => {
                    setRemovingName(remote.name);
                    setEditingName(null);
                    setRenamingName(null);
                  }}
                  disabled={isRunning}
                  data-testid={`remote-manager-remove-${remote.name}`}
                >
                  Remove
                </Button>
              </div>

              {editingName === remote.name ? (
                <div className="remote-manager-inline-form">
                  <ModalField
                    rowClassName="sync-dialog-field-row"
                    labelClassName="sync-dialog-field-label"
                    htmlFor={`remote-fetch-url-${remote.name}`}
                    label="Fetch URL:"
                  >
                    <TextInput
                      id={`remote-fetch-url-${remote.name}`}
                      className="sync-dialog-input"
                      value={editFetchUrl}
                      onChange={(event) => setEditFetchUrl(event.target.value)}
                      spellCheck={false}
                      data-testid={`remote-manager-fetch-url-${remote.name}`}
                    />
                  </ModalField>
                  <ModalField
                    rowClassName="sync-dialog-field-row"
                    labelClassName="sync-dialog-field-label"
                    htmlFor={`remote-push-url-${remote.name}`}
                    label="Push URL:"
                  >
                    <TextInput
                      id={`remote-push-url-${remote.name}`}
                      className="sync-dialog-input"
                      value={editPushUrl}
                      onChange={(event) => setEditPushUrl(event.target.value)}
                      spellCheck={false}
                      data-testid={`remote-manager-push-url-${remote.name}`}
                    />
                  </ModalField>
                  {editError ? (
                    <div
                      className="sync-dialog-error"
                      role="alert"
                      data-testid="remote-manager-edit-error"
                    >
                      {editError}
                    </div>
                  ) : null}
                  <div className="remote-manager-inline-actions">
                    <Button
                      className="sync-dialog-btn primary"
                      onClick={() => handleSaveUrls(remote)}
                      data-testid={`remote-manager-save-url-${remote.name}`}
                    >
                      Save URL
                    </Button>
                    <Button
                      className="sync-dialog-btn"
                      onClick={() => setEditingName(null)}
                      data-testid="remote-manager-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {renamingName === remote.name ? (
                <div className="remote-manager-inline-form">
                  <ModalField
                    rowClassName="sync-dialog-field-row"
                    labelClassName="sync-dialog-field-label"
                    htmlFor={`remote-rename-input-${remote.name}`}
                    label="New name:"
                  >
                    <TextInput
                      id={`remote-rename-input-${remote.name}`}
                      className="sync-dialog-input"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      spellCheck={false}
                      data-testid="remote-manager-rename-input"
                    />
                  </ModalField>
                  {renameError ? (
                    <div
                      className="sync-dialog-error"
                      role="alert"
                      data-testid="remote-manager-rename-error"
                    >
                      {renameError}
                    </div>
                  ) : null}
                  <div className="remote-manager-inline-actions">
                    <Button
                      className="sync-dialog-btn primary"
                      onClick={() => handleRename(remote)}
                      data-testid="remote-manager-save-rename"
                    >
                      Rename
                    </Button>
                    <Button
                      className="sync-dialog-btn"
                      onClick={() => setRenamingName(null)}
                      data-testid="remote-manager-cancel-rename"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {removingName === remote.name ? (
                <div className="remote-manager-remove-confirm">
                  <p>
                    Remove remote <strong>{remote.name}</strong>? Remote-tracking branches for this
                    remote will no longer be available.
                  </p>
                  <div className="remote-manager-inline-actions">
                    <Button
                      className="sync-dialog-btn primary danger"
                      onClick={() => {
                        onRemove(remote.name);
                        setRemovingName(null);
                      }}
                      data-testid="remote-manager-confirm-remove"
                    >
                      Remove Remote
                    </Button>
                    <Button
                      className="sync-dialog-btn"
                      onClick={() => setRemovingName(null)}
                      data-testid="remote-manager-cancel-remove"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="remote-manager-add">
        <span className="sync-dialog-section-title">Add Remote</span>
        <div className="remote-manager-add-fields">
          <TextInput
            ref={nameInputRef}
            className="sync-dialog-input"
            value={addName}
            onChange={(event) => setAddName(event.target.value)}
            placeholder="Remote name"
            aria-label="New remote name"
            spellCheck={false}
            data-testid="remote-manager-add-name"
          />
          <TextInput
            className="sync-dialog-input"
            value={addUrl}
            onChange={(event) => setAddUrl(event.target.value)}
            placeholder="https://example.com/repo.git"
            aria-label="New remote URL"
            spellCheck={false}
            data-testid="remote-manager-add-url"
          />
          <Button
            className="sync-dialog-btn primary"
            onClick={handleAdd}
            disabled={isRunning}
            data-testid="remote-manager-add-btn"
          >
            Add Remote
          </Button>
        </div>
        {addError ? (
          <div className="sync-dialog-error" role="alert" data-testid="remote-manager-add-error">
            {addError}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="sync-dialog-error" role="alert" data-testid="remote-manager-error">
          {error}
        </div>
      ) : null}

      <ModalActions
        className="sync-dialog-actions"
        actions={[
          {
            text: 'Refresh',
            onClick: onRefresh,
            testId: 'remote-manager-refresh-btn',
            className: 'sync-dialog-btn',
            disabled: isLoading,
          },
          {
            text: 'Close',
            onClick: onClose,
            testId: 'remote-manager-close-btn',
            className: 'sync-dialog-btn primary',
          },
        ]}
      />
    </Modal>
  );
};
