import * as vscode from 'vscode';

type L10nApi = {
  t?: (message: string, ...args: Array<string | number | boolean>) => string;
};

function formatFallback(message: string, args: Array<string | number | boolean>): string {
  if (args.length === 0) {
    return message;
  }
  return message.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number.parseInt(index, 10)];
    return value === undefined ? match : String(value);
  });
}

/**
 * Translates a user-facing string using the VS Code display language.
 * Falls back to simple `{0}` interpolation when the l10n API is unavailable
 * (for example in unit tests or older VS Code versions).
 */
export function t(message: string, ...args: Array<string | number | boolean>): string {
  const l10n = (vscode as unknown as { l10n?: L10nApi }).l10n;
  if (l10n?.t) {
    try {
      return l10n.t(message, ...args);
    } catch {
      // Fall through to the local interpolation fallback.
    }
  }
  return formatFallback(message, args);
}
