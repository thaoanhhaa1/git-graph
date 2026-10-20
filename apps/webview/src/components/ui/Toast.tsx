import React from 'react';

export type ToastType = 'info' | 'loading' | 'success' | 'error';

export interface ToastState {
  message: string;
  type?: ToastType;
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
  return (
    <div className={className} role="status" aria-live="polite" data-testid={testId}>
      {toast.type === 'loading' ? (
        <span className="toast-spinner" data-testid="toast-spinner" />
      ) : toast.type === 'error' ? (
        <span className="toast-icon error">✕</span>
      ) : (
        <span className="toast-icon">✓</span>
      )}
      <span>{toast.message}</span>
    </div>
  );
};
