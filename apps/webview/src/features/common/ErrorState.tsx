import React from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryText?: string;
  secondaryAction?: () => void;
  secondaryText?: string;
  tertiaryAction?: () => void;
  tertiaryText?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to Load Git Graph',
  message,
  onRetry,
  retryText = 'Retry',
  secondaryAction,
  secondaryText = 'Cancel',
  tertiaryAction,
  tertiaryText = 'Skip',
}) => {
  return (
    <section className="error-state" role="alert" data-testid="error-state">
      <div className="error-state-icon" aria-hidden="true">
        <Icon name="alert-circle" size={36} />
      </div>
      <h2 className="error-state-title" data-testid="error-state-title">
        {title}
      </h2>
      <p className="error-state-message" data-testid="error-state-message">
        {message}
      </p>
      {(onRetry || secondaryAction || tertiaryAction) && (
        <div className="error-state-actions">
          {onRetry && (
            <Button
              variant="none"
              className="error-state-retry"
              onClick={onRetry}
              data-testid="retry-btn"
            >
              {retryText}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="none"
              className="error-state-retry secondary"
              onClick={secondaryAction}
              data-testid="secondary-action-btn"
            >
              {secondaryText}
            </Button>
          )}
          {tertiaryAction && (
            <Button
              variant="none"
              className="error-state-retry secondary"
              onClick={tertiaryAction}
              data-testid="tertiary-action-btn"
            >
              {tertiaryText}
            </Button>
          )}
        </div>
      )}
    </section>
  );
};
