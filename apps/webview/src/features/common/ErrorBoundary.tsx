import React from 'react';
import { ErrorState } from './ErrorState';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[GitGraph] React error boundary caught an error', error, errorInfo);
  }

  public render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ErrorState
          title="Git Graph stopped rendering"
          message={this.state.error.message || 'An unexpected rendering error occurred.'}
          retryText="Reload Webview"
          onRetry={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
