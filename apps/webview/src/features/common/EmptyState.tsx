import React from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  testId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Git Repositories Found',
  description = 'The current workspace does not contain any Git repositories. Initialize a Git repository or open a folder containing a Git repository to use Git Graph.',
  actionText = 'Scan Repositories',
  onAction,
  icon,
  testId = 'empty-repo-state',
}) => {
  return (
    <section className="empty-state" data-testid={testId}>
      <div className="empty-state-icon" aria-hidden="true">
        {icon || <Icon name="info-circle" size={40} />}
      </div>
      <h2 className="empty-state-title" data-testid="empty-state-title">
        {title}
      </h2>
      <p className="empty-state-description" data-testid="empty-state-desc">
        {description}
      </p>
      {actionText && onAction && (
        <Button
          className="empty-state-action"
          onClick={onAction}
          data-testid="empty-state-refresh-btn"
        >
          {actionText}
        </Button>
      )}
    </section>
  );
};
