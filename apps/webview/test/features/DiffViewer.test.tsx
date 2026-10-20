// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FileChange } from '@git-graph/shared';
import { DiffViewer, parseUnifiedDiff } from '../../src/features/diff/DiffViewer';
import { useDiffStore } from '../../src/stores/diffStore';

describe('DiffViewer and parseUnifiedDiff', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useDiffStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    useDiffStore.getState().reset();
    vi.restoreAllMocks();
  });

  const sampleRawDiff = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
-const oldVar = 1;
+const newVar = 2;
+const extraVar = 3;
 const common = true;
`;

  describe('parseUnifiedDiff parser', () => {
    it('parses empty diff into empty array', () => {
      expect(parseUnifiedDiff('')).toEqual([]);
    });

    it('parses unified diff lines with correct old and new line numbers', () => {
      const parsed = parseUnifiedDiff(sampleRawDiff);

      // Header lines
      expect(parsed[0]?.type).toBe('header');
      expect(parsed[0]?.text).toContain('diff --git');

      // Hunk line
      const hunkLine = parsed.find((p) => p.type === 'hunk');
      expect(hunkLine).toBeTruthy();
      expect(hunkLine?.text).toContain('@@ -1,4 +1,5 @@');

      // Deleted line
      const delLine = parsed.find((p) => p.type === 'delete');
      expect(delLine).toBeTruthy();
      expect(delLine?.text).toBe('const oldVar = 1;');
      expect(delLine?.oldLineNumber).toBe(1);
      expect(delLine?.newLineNumber).toBeUndefined();

      // Added lines
      const addLines = parsed.filter((p) => p.type === 'add');
      expect(addLines.length).toBe(2);
      expect(addLines[0]?.text).toBe('const newVar = 2;');
      expect(addLines[0]?.oldLineNumber).toBeUndefined();
      expect(addLines[0]?.newLineNumber).toBe(1);

      expect(addLines[1]?.text).toBe('const extraVar = 3;');
      expect(addLines[1]?.newLineNumber).toBe(2);

      // Context line
      const ctxLine = parsed.find((p) => p.type === 'context');
      expect(ctxLine).toBeTruthy();
      expect(ctxLine?.text).toBe('const common = true;');
      expect(ctxLine?.oldLineNumber).toBe(2);
      expect(ctxLine?.newLineNumber).toBe(3);
    });
  });

  describe('DiffViewer Component', () => {
    const fileChange: FileChange = {
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      isBinary: false,
    };

    it('returns null if selectedFile is null', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(<DiffViewer selectedFile={null} />);
      });

      expect(container.children.length).toBe(0);

      await act(async () => {
        root.unmount();
      });
    });

    it('renders loading state when isLoading is true', async () => {
      useDiffStore.setState({
        selectedFilePath: 'src/app.ts',
        isLoading: true,
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer repositoryId="repo-1" commitSha="sha-1" selectedFile={fileChange} />,
        );
      });

      const loading = container.querySelector('[data-testid="diff-loading"]');
      expect(loading).toBeTruthy();
      expect(loading?.textContent).toContain('Loading diff for src/app.ts...');

      await act(async () => {
        root.unmount();
      });
    });

    it('renders error state with retry button', async () => {
      const requestDiffSpy = vi.spyOn(useDiffStore.getState(), 'requestDiff');
      useDiffStore.setState({
        currentRepositoryId: 'repo-1',
        currentSha: 'sha-1',
        selectedFilePath: 'src/app.ts',
        isLoading: false,
        error: 'Network failure',
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer repositoryId="repo-1" commitSha="sha-1" selectedFile={fileChange} />,
        );
      });

      const errorEl = container.querySelector('[data-testid="diff-error"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.textContent).toContain('Network failure');

      const retryBtn = container.querySelector(
        '[data-testid="diff-retry-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        retryBtn.click();
      });
      expect(requestDiffSpy).toHaveBeenCalledWith('repo-1', 'sha-1', 'src/app.ts', undefined);

      await act(async () => {
        root.unmount();
      });
    });

    it('renders binary file state when file is binary', async () => {
      const binaryFile: FileChange = {
        path: 'image.png',
        status: 'added',
        isBinary: true,
      };

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer repositoryId="repo-1" commitSha="sha-1" selectedFile={binaryFile} />,
        );
      });

      const binaryState = container.querySelector('[data-testid="diff-binary-state"]');
      expect(binaryState).toBeTruthy();
      expect(binaryState?.textContent).toContain('Binary file not shown');

      await act(async () => {
        root.unmount();
      });
    });

    it('renders truncated warning banner when diff is truncated', async () => {
      useDiffStore.setState({
        currentRepositoryId: 'repo-1',
        currentSha: 'sha-1',
        selectedFilePath: 'src/app.ts',
        diffResult: {
          diff: sampleRawDiff,
          isTruncated: true,
          isBinary: false,
          truncatedBytes: 1048576,
        },
        isLoading: false,
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer repositoryId="repo-1" commitSha="sha-1" selectedFile={fileChange} />,
        );
      });

      const truncatedBanner = container.querySelector('[data-testid="diff-truncated-banner"]');
      expect(truncatedBanner).toBeTruthy();
      expect(truncatedBanner?.textContent).toContain('Diff was truncated');

      await act(async () => {
        root.unmount();
      });
    });

    it('safely renders diff text without injecting raw HTML (XSS prevention)', async () => {
      const maliciousDiff = `diff --git a/xss.txt b/xss.txt
@@ -1,1 +1,1 @@
-<img src=x onerror="alert(1)">
+<script>window.pwned=true</script>
`;

      useDiffStore.setState({
        currentRepositoryId: 'repo-1',
        currentSha: 'sha-1',
        selectedFilePath: 'xss.txt',
        diffResult: {
          diff: maliciousDiff,
          isTruncated: false,
          isBinary: false,
        },
        isLoading: false,
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer
            repositoryId="repo-1"
            commitSha="sha-1"
            selectedFile={{ path: 'xss.txt', status: 'modified', isBinary: false }}
          />,
        );
      });

      // Assert no script or img tags got injected into the DOM
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();

      // Assert text is rendered safely as string
      const addLine = container.querySelector('.diff-line-add');
      expect(addLine?.textContent).toContain('<script>window.pwned=true</script>');

      const delLine = container.querySelector('.diff-line-delete');
      expect(delLine?.textContent).toContain('<img src=x onerror="alert(1)">');

      await act(async () => {
        root.unmount();
      });
    });

    it('handles Open in VS Code button click and onClose click', async () => {
      const onOpenDiffInVsCode = vi.fn();
      const onClose = vi.fn();

      useDiffStore.setState({
        selectedFilePath: 'src/app.ts',
        diffResult: {
          diff: sampleRawDiff,
          isTruncated: false,
          isBinary: false,
        },
        isLoading: false,
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DiffViewer
            repositoryId="repo-1"
            commitSha="sha-1"
            parentSha="parent-1"
            selectedFile={fileChange}
            onClose={onClose}
            onOpenDiffInVsCode={onOpenDiffInVsCode}
          />,
        );
      });

      const openVsCodeBtn = container.querySelector(
        '[data-testid="diff-open-vscode-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        openVsCodeBtn.click();
      });
      expect(onOpenDiffInVsCode).toHaveBeenCalledWith('src/app.ts', undefined);

      const closeBtn = container.querySelector(
        '[data-testid="close-diff-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        closeBtn.click();
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => {
        root.unmount();
      });
    });
  });
});
