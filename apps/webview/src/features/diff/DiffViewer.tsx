import React, { useEffect, useMemo, useCallback } from 'react';
import type { FileChange } from '@git-graph/shared';
import { useDiffStore } from '../../stores/diffStore';
import { openDiffInVsCode } from '../../messaging/messageRouter';

export interface DiffViewerProps {
  repositoryId?: string;
  commitSha?: string;
  parentSha?: string;
  baseSha?: string;
  targetSha?: string;
  selectedFile: FileChange | null;
  onClose?: () => void;
  onOpenDiffInVsCode?: (filePath: string, oldPath?: string) => void;
}

export type DiffLineType = 'header' | 'hunk' | 'add' | 'delete' | 'context';

export interface ParsedDiffLine {
  type: DiffLineType;
  prefix: string;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Safely parses raw unified diff string into structured lines with old/new line numbers.
 * No HTML is generated or interpreted here - everything is pure text.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedDiffLine[] {
  if (!rawDiff) {
    return [];
  }

  const rawLines = rawDiff.split(/\r?\n/);
  const parsedLines: ParsedDiffLine[] = [];

  let currentOld = 0;
  let currentNew = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;

    if (line.startsWith('@@')) {
      // Hunk header e.g.: @@ -15,7 +15,9 @@ function example()
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/.exec(line);
      if (match) {
        currentOld = parseInt(match[1]!, 10);
        currentNew = parseInt(match[3]!, 10);
      }
      parsedLines.push({
        type: 'hunk',
        prefix: '@@',
        text: line,
      });
    } else if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename from') ||
      line.startsWith('rename to')
    ) {
      parsedLines.push({
        type: 'header',
        prefix: '',
        text: line,
      });
    } else if (line.startsWith('+')) {
      parsedLines.push({
        type: 'add',
        prefix: '+',
        text: line.slice(1),
        newLineNumber: currentNew++,
      });
    } else if (line.startsWith('-')) {
      parsedLines.push({
        type: 'delete',
        prefix: '-',
        text: line.slice(1),
        oldLineNumber: currentOld++,
      });
    } else if (line.startsWith('\\ No newline at end of file')) {
      parsedLines.push({
        type: 'header',
        prefix: '\\',
        text: line,
      });
    } else {
      // Context line (or empty context)
      const text = line.startsWith(' ') ? line.slice(1) : line;
      parsedLines.push({
        type: 'context',
        prefix: ' ',
        text,
        oldLineNumber: currentOld++,
        newLineNumber: currentNew++,
      });
    }
  }

  return parsedLines;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  repositoryId,
  commitSha,
  parentSha,
  baseSha,
  targetSha,
  selectedFile,
  onClose,
  onOpenDiffInVsCode,
}) => {
  const diffResult = useDiffStore((s) => s.diffResult);
  const isLoading = useDiffStore((s) => s.isLoading);
  const error = useDiffStore((s) => s.error);
  const currentRepositoryId = useDiffStore((s) => s.currentRepositoryId);
  const currentSha = useDiffStore((s) => s.currentSha);
  const selectedFilePath = useDiffStore((s) => s.selectedFilePath);
  const requestDiff = useDiffStore((s) => s.requestDiff);

  const effectiveTarget = targetSha ?? commitSha;
  const effectiveBase = baseSha ?? parentSha;

  // Lazy-load diff when selected file, commit, or parent changes
  useEffect(() => {
    if (repositoryId && effectiveTarget && selectedFile) {
      if (!selectedFile.isBinary) {
        const isAlreadyCurrent =
          currentRepositoryId === repositoryId &&
          currentSha === effectiveTarget &&
          selectedFilePath === selectedFile.path &&
          (diffResult !== null || isLoading || error !== null);

        if (!isAlreadyCurrent) {
          if (baseSha || targetSha) {
            requestDiff(
              repositoryId,
              effectiveTarget,
              selectedFile.path,
              effectiveBase,
              undefined,
              undefined,
              baseSha,
              targetSha,
            );
          } else {
            requestDiff(repositoryId, effectiveTarget, selectedFile.path, effectiveBase);
          }
        }
      }
    }
  }, [
    repositoryId,
    effectiveTarget,
    effectiveBase,
    baseSha,
    targetSha,
    selectedFile,
    currentRepositoryId,
    currentSha,
    selectedFilePath,
    diffResult,
    isLoading,
    error,
    requestDiff,
  ]);

  const handleRetry = useCallback(() => {
    if (repositoryId && effectiveTarget && selectedFile) {
      if (baseSha || targetSha) {
        requestDiff(
          repositoryId,
          effectiveTarget,
          selectedFile.path,
          effectiveBase,
          undefined,
          undefined,
          baseSha,
          targetSha,
        );
      } else {
        requestDiff(repositoryId, effectiveTarget, selectedFile.path, effectiveBase);
      }
    }
  }, [repositoryId, effectiveTarget, effectiveBase, baseSha, targetSha, selectedFile, requestDiff]);

  const handleOpenInVsCode = useCallback(() => {
    if (!selectedFile) return;
    if (onOpenDiffInVsCode) {
      onOpenDiffInVsCode(selectedFile.path, selectedFile.oldPath);
    } else if (repositoryId && effectiveTarget) {
      if (baseSha || targetSha) {
        openDiffInVsCode(
          repositoryId,
          effectiveTarget,
          selectedFile.path,
          effectiveBase,
          selectedFile.oldPath,
          false,
          baseSha,
          targetSha,
        );
      } else {
        openDiffInVsCode(
          repositoryId,
          effectiveTarget,
          selectedFile.path,
          effectiveBase,
          selectedFile.oldPath,
        );
      }
    }
  }, [
    selectedFile,
    onOpenDiffInVsCode,
    repositoryId,
    effectiveTarget,
    effectiveBase,
    baseSha,
    targetSha,
  ]);

  const parsedLines = useMemo(() => {
    if (!diffResult?.diff) return [];
    return parseUnifiedDiff(diffResult.diff);
  }, [diffResult?.diff]);

  if (!selectedFile) {
    return null;
  }

  const isBinary = selectedFile.isBinary || diffResult?.isBinary;
  const isTruncated = diffResult?.isTruncated;

  return (
    <div
      className="diff-viewer-panel"
      data-testid="diff-viewer-panel"
      role="region"
      aria-label="Diff Viewer"
    >
      {/* Diff Viewer Header */}
      <div className="diff-viewer-header">
        <div className="diff-viewer-title">
          <span className="diff-file-icon">📄</span>
          <span className="diff-file-path" data-testid="diff-file-path" title={selectedFile.path}>
            {selectedFile.oldPath && selectedFile.oldPath !== selectedFile.path
              ? `${selectedFile.oldPath} → ${selectedFile.path}`
              : selectedFile.path}
          </span>
          <span
            className={`diff-status-pill status-${selectedFile.status}`}
            data-testid="diff-status-pill"
          >
            {selectedFile.status}
          </span>
        </div>

        <div className="diff-viewer-actions">
          <button
            type="button"
            className="diff-action-btn open-vscode-btn"
            onClick={handleOpenInVsCode}
            title="Open in VS Code Diff Editor"
            aria-label="Open diff in VS Code"
            data-testid="diff-open-vscode-btn"
          >
            ⧉ Open in VS Code
          </button>
          {onClose && (
            <button
              type="button"
              className="diff-action-btn close-diff-btn"
              onClick={onClose}
              title="Close diff view"
              aria-label="Close diff view"
              data-testid="close-diff-btn"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Diff Body Content */}
      <div className="diff-viewer-content" data-testid="diff-viewer-content">
        {isLoading ? (
          <div className="diff-loading" data-testid="diff-loading" role="status">
            <span className="loading-spinner" />
            <span>Loading diff for {selectedFile.path}...</span>
          </div>
        ) : error ? (
          <div className="diff-error" data-testid="diff-error" role="alert">
            <p className="diff-error-title">Failed to load diff</p>
            <p className="diff-error-message">{error}</p>
            <button
              type="button"
              className="diff-action-btn retry-btn"
              onClick={handleRetry}
              data-testid="diff-retry-btn"
            >
              Retry
            </button>
          </div>
        ) : isBinary ? (
          <div className="diff-binary-state" data-testid="diff-binary-state">
            <div className="diff-binary-icon">⚠️</div>
            <p className="diff-binary-title">Binary file not shown</p>
            <p className="diff-binary-desc">
              This file is binary and cannot be rendered in the text diff viewer.
            </p>
            <button
              type="button"
              className="diff-action-btn open-vscode-btn"
              onClick={handleOpenInVsCode}
              data-testid="binary-open-vscode-btn"
            >
              Open File in VS Code
            </button>
          </div>
        ) : (
          <>
            {/* Truncated Warning Banner */}
            {isTruncated && (
              <div
                className="diff-truncated-banner"
                data-testid="diff-truncated-banner"
                role="alert"
              >
                <span className="truncated-icon">⚠️</span>
                <span className="truncated-message">
                  Diff was truncated because it exceeds the maximum size limit.
                </span>
                <button
                  type="button"
                  className="diff-action-btn truncated-open-btn"
                  onClick={handleOpenInVsCode}
                  data-testid="truncated-open-vscode-btn"
                >
                  Open Full Diff in VS Code
                </button>
              </div>
            )}

            {/* Unified Diff Table / Lines */}
            {parsedLines.length === 0 ? (
              <div className="diff-empty-state" data-testid="diff-empty-state">
                No differences found or empty file.
              </div>
            ) : (
              <div
                className="diff-code-table"
                data-testid="diff-code-table"
                role="region"
                aria-label="Diff text content"
              >
                {parsedLines.map((line, idx) => (
                  <div
                    key={`${idx}-${line.type}-${line.oldLineNumber ?? ''}-${line.newLineNumber ?? ''}`}
                    className={`diff-line diff-line-${line.type}`}
                    data-testid={`diff-line-${line.type}`}
                  >
                    {/* Line numbers */}
                    <div className="diff-line-number diff-line-number-old" aria-hidden="true">
                      {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                    </div>
                    <div className="diff-line-number diff-line-number-new" aria-hidden="true">
                      {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                    </div>

                    {/* Prefix marker (+, -, @@, space) */}
                    <div className="diff-line-marker" aria-hidden="true">
                      {line.type === 'add'
                        ? '+'
                        : line.type === 'delete'
                          ? '-'
                          : line.type === 'hunk'
                            ? ''
                            : ' '}
                    </div>

                    {/* Pure safe text content rendered safely as React string child */}
                    <div className="diff-line-content">
                      <span className="diff-line-text">{line.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
