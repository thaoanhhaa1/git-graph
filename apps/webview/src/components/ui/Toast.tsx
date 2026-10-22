import React from 'react';

export type ToastType = 'info' | 'loading' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  message: string;
  type?: ToastType;
  action?: ToastAction;
}

export interface ToastProps {
  toast: ToastState;
  className?: string;
  testId?: string;
}

export const Toast: React.FC<ToastProps> = ({
  toast,
  className = 'graph-toast-notification',
  testId = 'graph-toast-notification',
}) => {
  const isError = toast.type === 'error';
  return (
    <div
      className={className}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-testid={testId}
    >
      {toast.type === 'loading' ? (
        <span className="toast-spinner" data-testid="toast-spinner" />
      ) : toast.type === 'error' ? (
        <span className="toast-icon error">✕</span>
      ) : (
        <span className="toast-icon">✓</span>
      )}
      <span>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="toast-action-btn"
          onClick={toast.action.onClick}
          data-testid="toast-action-btn"
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
};
