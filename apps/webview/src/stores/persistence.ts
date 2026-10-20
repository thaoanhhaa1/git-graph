import type { ViewConfig } from './configStore';
import { getVsCodeApi } from '../messaging/vscodeApi';

export interface ColumnWidths {
  graph?: number;
  description?: number;
  date?: number;
  author?: number;
  commit?: number;
}

export interface WebviewPersistedState {
  activeRepositoryId?: string | null;
  selectedCommitSha?: string | null;
  selectedBranch?: string;
  searchTerm?: string;
  viewConfig?: Partial<ViewConfig>;
  columnWidths?: ColumnWidths;
}

/**
 * Loads persisted Webview state from VS Code via vscode.getState().
 */
export function loadPersistedState(): WebviewPersistedState | undefined {
  try {
    const api = getVsCodeApi<WebviewPersistedState>();
    return api.getState();
  } catch {
    return undefined;
  }
}

/**
 * Saves given partial state into VS Code Webview state via vscode.setState()
 * allowing the Webview to restore its UI state instantly when tab visibility changes.
 */
export function savePersistedState(partial: Partial<WebviewPersistedState>): void {
  try {
    const api = getVsCodeApi<WebviewPersistedState>();
    const current = api.getState() || {};
    api.setState({ ...current, ...partial });
  } catch {
    // Non-vscode environments (e.g. headless tests without mock) ignore silently
  }
}
