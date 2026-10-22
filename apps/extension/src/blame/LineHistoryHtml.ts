import type { LineHistoryEntry, LineHistoryResult } from '@git-graph/shared';
import type * as vscode from 'vscode';

export function getLineHistoryHtml(
  webview: vscode.Webview,
  nonce: string,
  result: LineHistoryResult,
  repositoryId: string,
): string {
  const entries = result.entries.map((entry) => renderEntry(entry)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Line History</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 16px 20px 32px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 { font-size: 1.1em; margin: 0 0 4px; }
    .summary { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    .entries { display: flex; flex-direction: column; gap: 16px; }
    .entry {
      border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
      border-radius: 6px;
      padding: 10px 12px;
      background: var(--vscode-editorWidget-background, transparent);
    }
    .entry-header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
    .sha {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-textLink-foreground);
    }
    .subject { font-weight: 600; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 2px; }
    pre {
      margin: 10px 0;
      padding: 8px 10px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
    }
    .line { display: block; white-space: pre; }
    .add { color: var(--vscode-gitDecoration-addedResourceForeground, #81c784); }
    .del { color: var(--vscode-gitDecoration-deletedResourceForeground, #e57373); }
    .hunk { color: var(--vscode-descriptionForeground); }
    .meta-line { color: var(--vscode-descriptionForeground); }
    button {
      margin-top: 4px;
      padding: 4px 10px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .empty { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h1>Line History: ${escapeHtml(result.filePath)}</h1>
  <div class="summary">Lines ${result.startLine}–${result.endLine} • ${result.entries.length} commit${result.entries.length === 1 ? '' : 's'}</div>
  <div class="entries">
    ${entries || '<p class="empty">No history found for the selected line range.</p>'}
  </div>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const repositoryId = ${JSON.stringify(repositoryId).replace(/</g, '\\u003c')};
      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest('button[data-sha]');
        if (!button) return;
        const sha = button.getAttribute('data-sha');
        if (!sha) return;
        vscode.postMessage({ type: 'revealCommit', sha: sha, repositoryId: repositoryId });
      });
    })();
  </script>
</body>
</html>`;
}

function renderEntry(entry: LineHistoryEntry): string {
  return `<article class="entry">
    <div class="entry-header">
      <span class="sha">${escapeHtml(entry.shortSha)}</span>
      <span class="subject">${escapeHtml(entry.subject || '(no commit message)')}</span>
    </div>
    <div class="meta">${escapeHtml(entry.author)} &lt;${escapeHtml(entry.authorEmail)}&gt; • ${escapeHtml(formatTimestamp(entry.timestamp))} • ${escapeHtml(entry.filePath)}</div>
    <pre>${renderDiff(entry.diff)}</pre>
    <button type="button" data-sha="${escapeAttribute(entry.sha)}">Reveal in Git Graph</button>
  </article>`;
}

function renderDiff(diff: string): string {
  if (!diff) {
    return '<span class="line meta-line">(no diff available)</span>';
  }

  return diff
    .split('\n')
    .map((line) => {
      let className = 'line';
      if (line.startsWith('+') && !line.startsWith('+++')) {
        className += ' add';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        className += ' del';
      } else if (line.startsWith('@@')) {
        className += ' hunk';
      } else if (
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++')
      ) {
        className += ' meta-line';
      }
      return `<span class="${className}">${escapeHtml(line)}</span>`;
    })
    .join('');
}

function formatTimestamp(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
