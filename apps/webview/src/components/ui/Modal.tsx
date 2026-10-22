import React, { useEffect, useRef } from 'react';
import { Button, type ButtonVariant } from './Button';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** id referenced by aria-labelledby; should match the ModalTitle id. */
  titleId: string;
  onConfirm?: () => void;
  overlayClassName?: string;
  dialogClassName?: string;
  overlayTestId?: string;
  dialogTestId?: string;
  children: React.ReactNode;
}

/**
 * Shared modal shell: handles Escape to close, Enter to confirm, and
 * click-on-overlay to close, with the correct dialog ARIA semantics.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  titleId,
  onConfirm,
  overlayClassName,
  dialogClassName,
  overlayTestId,
  dialogTestId,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = getFocusableElements(dialog);
      (focusable[0] ?? dialog).focus();
    }

    return () => {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && onConfirm) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'BUTTON' || target?.tagName === 'TEXTAREA') {
        // Let the focused button or multi-line textarea handle its own Enter key.
        return;
      }
      e.preventDefault();
      onConfirm();
    } else if (e.key === 'Tab') {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={overlayTestId}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div ref={dialogRef} className={dialogClassName} data-testid={dialogTestId} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
};

Modal.displayName = 'Modal';

export interface ModalTitleProps {
  id: string;
  className?: string;
  children: React.ReactNode;
}

export const ModalTitle: React.FC<ModalTitleProps> = ({ id, className, children }) => (
  <div className={className} id={id}>
    {children}
  </div>
);

ModalTitle.displayName = 'ModalTitle';

export interface ModalFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  rowClassName?: string;
  labelClassName?: string;
  labelTestId?: string;
  children: React.ReactNode;
}

/** A label + control row used inside modal forms. */
export const ModalField: React.FC<ModalFieldProps> = ({
  label,
  htmlFor,
  rowClassName,
  labelClassName,
  labelTestId,
  children,
}) => (
  <div className={rowClassName}>
    <label className={labelClassName} htmlFor={htmlFor} data-testid={labelTestId}>
      {label}
    </label>
    {children}
  </div>
);

ModalField.displayName = 'ModalField';

export interface ModalAction {
  text: string;
  onClick: () => void;
  testId?: string;
  className?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export interface ModalActionsProps {
  actions: ModalAction[];
  className?: string;
}

export const ModalActions: React.FC<ModalActionsProps> = ({ actions, className }) => (
  <div className={className}>
    {actions.map((action, index) => (
      <Button
        key={action.testId ?? `${action.text}-${index}`}
        ref={action.ref}
        variant={action.variant ?? 'none'}
        className={action.className}
        onClick={action.onClick}
        data-testid={action.testId}
        disabled={action.disabled}
      >
        {action.text}
      </Button>
    ))}
  </div>
);

ModalActions.displayName = 'ModalActions';
