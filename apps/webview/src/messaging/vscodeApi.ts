import type { MessageEnvelope } from '@git-graph/shared';

/**
 * Standard interface matching VS Code's acquired Webview API.
 */
export interface VsCodeApi<TState = unknown> {
  postMessage(message: unknown): void;
  getState(): TState | undefined;
  setState(newState: TState): TState;
}

declare function acquireVsCodeApi<T = unknown>(): VsCodeApi<T>;

let currentApi: VsCodeApi<unknown> | null = null;

/**
 * Creates an in-memory mock implementation of VsCodeApi
 * for use in browser dev server, tests, or non-VS Code environments.
 */
export function createMockVsCodeApi<TState = unknown>(
  initialState?: TState,
  onMessage?: (message: unknown) => void,
): VsCodeApi<TState> {
  let state: TState | undefined = initialState;

  return {
    postMessage(message: unknown): void {
      if (onMessage) {
        onMessage(message);
      } else if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage({ channel: 'vscode-mock', message }, '*');
      }
    },
    getState(): TState | undefined {
      return state;
    },
    setState(newState: TState): TState {
      state = newState;
      return state;
    },
  };
}

/**
 * Retrieves the VS Code Webview API instance.
 * Calls acquireVsCodeApi() once and caches the result, or falls back to a mock in non-extension environments.
 */
export function getVsCodeApi<TState = unknown>(): VsCodeApi<TState> {
  if (!currentApi) {
    if (typeof acquireVsCodeApi === 'function') {
      try {
        currentApi = acquireVsCodeApi<unknown>();
      } catch {
        currentApi = createMockVsCodeApi<unknown>();
      }
    } else {
      currentApi = createMockVsCodeApi<unknown>();
    }
  }
  return currentApi as VsCodeApi<TState>;
}

/**
 * Allows tests or developer tools to override the active VsCodeApi instance.
 */
export function setVsCodeApi<TState = unknown>(api: VsCodeApi<TState> | null): void {
  currentApi = (api as VsCodeApi<unknown>) || null;
}

/**
 * Resets the cached VsCodeApi instance (useful in test teardown).
 */
export function resetVsCodeApi(): void {
  currentApi = null;
}

/**
 * Helper to safely post a typed protocol message to the VS Code Extension Host.
 */
export function postMessageToExtension<TType extends string, TPayload>(
  message: MessageEnvelope<TType, TPayload>,
): void {
  const api = getVsCodeApi();
  api.postMessage(message);
}

/**
 * Helper to subscribe to messages from the VS Code Extension Host.
 * Returns an unsubscribe callback for easy cleanup in useEffect.
 */
export function onMessageFromExtension(handler: (event: MessageEvent) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener('message', handler);
  return () => {
    window.removeEventListener('message', handler);
  };
}
