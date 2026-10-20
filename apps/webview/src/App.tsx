import React, { useEffect } from 'react';
import { initMessageRouter } from './messaging/messageRouter';
import { GitGraphView } from './features/graph/GitGraphView';
import { ErrorBoundary } from './features/common/ErrorBoundary';

export interface AppProps {
  searchDebounceMs?: number;
}

export const App: React.FC<AppProps> = ({ searchDebounceMs = 250 }) => {
  useEffect(() => {
    const unsubscribe = initMessageRouter();
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GitGraphView searchDebounceMs={searchDebounceMs} />
    </ErrorBoundary>
  );
};

export default App;
