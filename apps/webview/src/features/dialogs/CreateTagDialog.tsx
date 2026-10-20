import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalActions, ModalField, ModalTitle } from '../../components/ui/Modal';
import { TextInput } from '../../components/ui/TextInput';
import { CheckboxField } from '../../components/ui/Checkbox';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Select } from '../../components/ui/Select';
import type { TagType } from '@git-graph/shared';

export interface CreateTagDialogProps {
  commitSha: string;
  commitSubject?: string;
  remotes?: string[];
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    tagType: TagType,
    message: string | undefined,
    pushToRemote: boolean,
    remote?: string,
  ) => void;
}

export interface TagNameValidation {
  valid: boolean;
  error?: string;
}

const EMPTY_REMOTES: string[] = [];

/**
 * Validates a tag name using the same core rules as `git check-ref-format`.
 * Returns an actionable error message when the name is not acceptable.
 */
export function validateTagName(rawName: string): TagNameValidation {
  const name = rawName.trim();
  if (!name) {
    return { valid: false, error: 'Tag name is required.' };
  }
  if (name.startsWith('-')) {
    return { valid: false, error: "Tag name cannot start with a dash ('-')." };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\s]/.test(name)) {
    return { valid: false, error: 'Tag name cannot contain whitespace or control characters.' };
  }
  if (
    name.includes('..') ||
    name.includes('//') ||
    name.includes('@{') ||
    /[~^:?*[\\]/.test(name) ||
    name.endsWith('.') ||
    name.endsWith('/') ||
    name.endsWith('.lock')
  ) {
    return { valid: false, error: 'Tag name contains characters that Git does not allow.' };
  }
  return { valid: true };
}

export const CreateTagDialog: React.FC<CreateTagDialogProps> = ({
  commitSha,
  commitSubject,
  remotes = EMPTY_REMOTES,
  isOpen,
  onClose,
  onCreate,
}) => {
  const shortSha = commitSha.slice(0, 8);
  const [name, setName] = useState('');
  const [tagType, setTagType] = useState<TagType>('lightweight');
  const [message, setMessage] = useState('');
  const [pushToRemote, setPushToRemote] = useState(false);
  const [remote, setRemote] = useState(remotes[0] ?? 'origin');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultRemote = remotes[0] ?? 'origin';

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTagType('lightweight');
      setMessage('');
      setPushToRemote(false);
      setRemote(defaultRemote);
      setTouched(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, commitSha, defaultRemote]);

  const validation = validateTagName(name);
  const showValidationError = touched && !validation.valid;
  const canSubmit = validation.valid && (tagType === 'lightweight' || message.trim().length > 0);

  const handleConfirm = () => {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    onCreate(
      name.trim(),
      tagType,
      tagType === 'annotated' ? message.trim() : undefined,
      pushToRemote,
      pushToRemote ? remote : undefined,
    );
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="create-tag-title"
      overlayClassName="create-tag-modal-overlay"
      dialogClassName="create-tag-dialog"
      overlayTestId="create-tag-dialog-overlay"
      dialogTestId="create-tag-dialog"
    >
      <ModalTitle className="create-tag-title" id="create-tag-title">
        Create tag at commit <em>{shortSha}</em>:
      </ModalTitle>

      {commitSubject ? (
        <p className="create-tag-commit-subject" data-testid="create-tag-commit-subject">
          {commitSubject}
        </p>
      ) : null}

      <div className="create-tag-form">
        <ModalField
          rowClassName="create-tag-field-row"
          labelClassName="create-tag-field-label"
          labelTestId="create-tag-name-label"
          htmlFor="create-tag-name-input"
          label="Name:"
        >
          <div className="create-tag-input-wrapper">
            <TextInput
              id="create-tag-name-input"
              ref={inputRef}
              className="create-tag-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              data-testid="create-tag-name-input"
              aria-label="Tag name"
              aria-invalid={showValidationError}
              spellCheck={false}
              autoFocus
            />
            {showValidationError ? (
              <span className="create-tag-error" data-testid="create-tag-name-error" role="alert">
                {validation.error}
              </span>
            ) : null}
          </div>
        </ModalField>

        <ModalField
          rowClassName="create-tag-field-row"
          labelClassName="create-tag-field-label"
          labelTestId="create-tag-type-label"
          label="Type:"
        >
          <div className="create-tag-radio-group">
            <RadioGroup
              name="create-tag-type"
              value={tagType}
              onChange={(value) => setTagType(value as TagType)}
              itemClassName="create-tag-radio-label"
              options={[
                {
                  value: 'lightweight',
                  label: 'Lightweight',
                  testId: 'create-tag-type-lightweight',
                },
                {
                  value: 'annotated',
                  label: 'Annotated',
                  testId: 'create-tag-type-annotated',
                },
              ]}
            />
          </div>
        </ModalField>

        <ModalField
          rowClassName="create-tag-field-row create-tag-message-row"
          labelClassName="create-tag-field-label"
          labelTestId="create-tag-message-label"
          htmlFor="create-tag-message-input"
          label="Message:"
        >
          <textarea
            id="create-tag-message-input"
            className="create-tag-message-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="create-tag-message-input"
            aria-label="Tag message"
            disabled={tagType !== 'annotated'}
            rows={3}
            spellCheck={false}
          />
        </ModalField>

        <div className="create-tag-options">
          <CheckboxField
            labelClassName="create-tag-checkbox-label"
            labelTestId="create-tag-push-label"
            checkboxClassName="create-tag-checkbox"
            checkboxTestId="create-tag-push-checkbox"
            checked={pushToRemote}
            onChange={setPushToRemote}
          >
            <span>Push tag to remote</span>
          </CheckboxField>

          {pushToRemote && remotes.length > 1 ? (
            <ModalField
              rowClassName="create-tag-field-row"
              labelClassName="create-tag-field-label"
              labelTestId="create-tag-remote-label"
              htmlFor="create-tag-remote-select"
              label="Remote:"
            >
              <Select
                id="create-tag-remote-select"
                className="create-tag-select"
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                data-testid="create-tag-remote-select"
                aria-label="Remote to push the tag to"
                options={remotes.map((item) => ({ value: item, label: item }))}
              />
            </ModalField>
          ) : null}
        </div>
      </div>

      <ModalActions
        className="create-tag-actions"
        actions={[
          {
            text: 'Create Tag',
            onClick: handleConfirm,
            testId: 'create-tag-confirm-btn',
            className: 'create-tag-btn primary',
            disabled: !canSubmit,
          },
          {
            text: 'Cancel',
            onClick: onClose,
            testId: 'create-tag-cancel-btn',
            className: 'create-tag-btn',
          },
        ]}
      />
    </Modal>
  );
};
