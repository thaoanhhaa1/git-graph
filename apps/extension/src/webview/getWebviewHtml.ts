import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Generates a cryptographically secure 32-character random nonce.
 */
export function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Resolves the location of webview bundle assets (script and css).
 * Checks both packaged layout (dist/webview-ui) and monorepo dev layout (../webview/dist).
 */
export function resolveWebviewAssets(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): { scriptUri?: vscode.Uri; styleUri?: vscode.Uri } {
  const candidateDirs = [
    path.join(extensionUri.fsPath, 'dist', 'webview-ui'),
    path.join(extensionUri.fsPath, '..', 'webview', 'dist'),
  ];

  let foundBaseDir: string | undefined;
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      foundBaseDir = dir;
      break;
    }
  }

  if (!foundBaseDir) {
    return {};
  }

  const assetsDir = path.join(foundBaseDir, 'assets');
  let scriptUri: vscode.Uri | undefined;
  let styleUri: vscode.Uri | undefined;

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find((f) => f.endsWith('.js'));
    const cssFile = files.find((f) => f.endsWith('.css'));

    if (jsFile) {
      scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir, jsFile)));
    }
    if (cssFile) {
      styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir, cssFile)));
    }
  }

  return { scriptUri, styleUri };
}

/**
 * Generates the complete HTML for the Git Graph Webview with strict CSP,
 * nonce-protected scripts, and a VS Code-themed loading skeleton.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const { scriptUri, styleUri } = resolveWebviewAssets(webview, extensionUri);

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  const cssLink = styleUri ? `<link rel="stylesheet" type="text/css" href="${styleUri}" />` : '';

  const scriptTag = scriptUri
    ? `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`
    : `<script nonce="${nonce}">console.warn('Git Graph webview bundle not found on disk. Build @git-graph/webview first.');</script>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Git Graph</title>
  ${cssLink}
  <style>
    :root {
      --skeleton-bg: var(--vscode-editorWidget-background, rgba(255, 255, 255, 0.06));
      --skeleton-shimmer: var(--vscode-editor-background, rgba(255, 255, 255, 0.12));
      --border-color: var(--vscode-sideBar-border, rgba(128, 128, 128, 0.2));
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    #root {
      width: 100%;
      height: 100%;
    }

    .skeleton-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background-color: var(--vscode-editor-background);
      user-select: none;
    }

    .skeleton-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--vscode-editor-background);
      height: 42px;
    }

    .skeleton-item {
      position: relative;
      overflow: hidden;
      background-color: var(--skeleton-bg);
      border-radius: 4px;
    }

    .skeleton-item::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--skeleton-shimmer) 50%,
        transparent 100%
      );
      animation: shimmer 1.6s infinite ease-in-out;
    }

    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-item::after {
        animation: none;
      }
    }

    .skeleton-repo {
      width: 160px;
      height: 24px;
    }

    .skeleton-branch {
      width: 140px;
      height: 24px;
    }

    .skeleton-btn {
      width: 24px;
      height: 24px;
      border-radius: 3px;
    }

    .skeleton-spacer {
      flex: 1;
    }

    .skeleton-search {
      width: 200px;
      height: 24px;
    }

    .skeleton-graph {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .skeleton-row {
      display: flex;
      align-items: center;
      height: 32px;
      padding: 0 12px;
      border-bottom: 1px solid var(--border-color);
      gap: 12px;
    }

    .skeleton-lane {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .skeleton-hash {
      width: 60px;
      height: 16px;
      flex-shrink: 0;
    }

    .skeleton-badge {
      width: 80px;
      height: 18px;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .skeleton-message {
      height: 16px;
      flex: 1;
      max-width: 420px;
    }

    .skeleton-author {
      width: 110px;
      height: 16px;
      flex-shrink: 0;
      margin-left: auto;
    }

    .skeleton-date {
      width: 70px;
      height: 16px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="skeleton-container" aria-label="Loading Git Graph..." role="status">
      <div class="skeleton-toolbar">
        <div class="skeleton-item skeleton-repo"></div>
        <div class="skeleton-item skeleton-branch"></div>
        <div class="skeleton-item skeleton-btn"></div>
        <div class="skeleton-spacer"></div>
        <div class="skeleton-item skeleton-search"></div>
        <div class="skeleton-item skeleton-btn"></div>
      </div>
      <div class="skeleton-graph">
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-badge"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 320px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 400px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-badge"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 280px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 350px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 310px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-item skeleton-lane"></div>
          <div class="skeleton-item skeleton-hash"></div>
          <div class="skeleton-item skeleton-message" style="max-width: 250px;"></div>
          <div class="skeleton-item skeleton-author"></div>
          <div class="skeleton-item skeleton-date"></div>
        </div>
      </div>
    </div>
  </div>
  ${scriptTag}
</body>
</html>`;
}
