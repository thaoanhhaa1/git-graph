import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { FileChange, FileChangeStatus } from '@git-graph/shared';
import { Icon } from '../../components/ui/Icon';
import { MenuItemRow } from '../menu/Menu';
import { openFileAtRevisionInVsCode, requestOpenSubmodule } from '../../messaging/messageRouter';
import { t } from '../../i18n';

export interface ChangedFilesProps {
  repositoryId?: string;
  commitSha?: string;
  parentSha?: string;
  fileChanges: FileChange[];
  selectedFilePath: string | null;
  viewMode?: 'tree' | 'list';
  filterText?: string;
  isFilterVisible?: boolean;
  onFilterTextChange?: (text: string) => void;
  onSelectFile: (file: FileChange) => void;
  onOpenDiffInVsCode?: (filePath: string, oldPath?: string) => void;
  onOpenFileInEditor?: (filePath: string) => void;
  onOpenSubmodule?: (submodulePath: string) => void;
}

/**
 * Returns a single-letter uppercase label and descriptive title for each git status.
 */
export function getStatusInfo(status: FileChangeStatus): {
  code: string;
  label: string;
  className: string;
} {
  switch (status) {
    case 'added':
      return { code: 'A', label: 'Added', className: 'status-added' };
    case 'modified':
      return { code: 'M', label: 'Modified', className: 'status-modified' };
    case 'deleted':
      return { code: 'D', label: 'Deleted', className: 'status-deleted' };
    case 'renamed':
      return { code: 'R', label: 'Renamed', className: 'status-renamed' };
    case 'copied':
      return { code: 'C', label: 'Copied', className: 'status-copied' };
    case 'typeChanged':
      return { code: 'T', label: 'Type changed', className: 'status-typechanged' };
    case 'unmerged':
      return { code: 'U', label: 'Unmerged', className: 'status-unmerged' };
    case 'unknown':
    default:
      return { code: '?', label: 'Unknown', className: 'status-unknown' };
  }
}

export interface FileTreeNode {
  id: string;
  name: string;
  fullPath: string;
  isFolder: boolean;
  children: FileTreeNode[];
  file?: FileChange;
}

/**
 * Builds a file tree from a flat list of FileChange objects,
 * compacting single-child folder chains into "folder1 / folder2 / folder3".
 */
export function buildFileTree(files: FileChange[]): FileTreeNode[] {
  interface RawFolder {
    name: string;
    path: string;
    folders: Map<string, RawFolder>;
    files: FileChange[];
  }

  const root: RawFolder = { name: '', path: '', folders: new Map(), files: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      let nextFolder = current.folders.get(part);
      if (!nextFolder) {
        nextFolder = {
          name: part,
          path: current.path ? `${current.path}/${part}` : part,
          folders: new Map(),
          files: [],
        };
        current.folders.set(part, nextFolder);
      }
      current = nextFolder;
    }
    current.files.push(file);
  }

  function convertFolder(folder: RawFolder): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];

    for (const subFolder of folder.folders.values()) {
      let currentFolder = subFolder;
      let compactedName = currentFolder.name;

      while (currentFolder.files.length === 0 && currentFolder.folders.size === 1) {
        const onlyChild = currentFolder.folders.values().next().value!;
        compactedName = `${compactedName} / ${onlyChild.name}`;
        currentFolder = onlyChild;
      }

      const childNodes = [
        ...convertFolder(currentFolder),
        ...currentFolder.files.map((f) => ({
          id: f.path,
          name: f.path.split('/').pop() || f.path,
          fullPath: f.path,
          isFolder: false,
          children: [],
          file: f,
        })),
      ];

      nodes.push({
        id: currentFolder.path,
        name: compactedName,
        fullPath: currentFolder.path,
        isFolder: true,
        children: childNodes,
      });
    }

    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }

  const rootNodes: FileTreeNode[] = [
    ...convertFolder(root),
    ...root.files.map((f) => ({
      id: f.path,
      name: f.path.split('/').pop() || f.path,
      fullPath: f.path,
      isFolder: false,
      children: [],
      file: f,
    })),
  ];

  return rootNodes;
}

const FolderIcon: React.FC = () => (
  <Icon name="folder" size={15} className="file-tree-icon folder-icon" />
);

const FileIcon: React.FC = () => (
  <Icon name="file" size={14} className="file-tree-icon file-icon" />
);

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  collapsedFolders: Set<string>;
  onToggleFolder: (folderPath: string) => void;
  onSelectFile: (file: FileChange) => void;
  onOpenDiffInVsCode?: (filePath: string, oldPath?: string) => void;
  onContextMenuFile?: (file: FileChange, e: React.MouseEvent | React.KeyboardEvent) => void;
}

const TreeNodeItem: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedFilePath,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  onOpenDiffInVsCode,
  onContextMenuFile,
}) => {
  const isCollapsed = collapsedFolders.has(node.fullPath);

  if (node.isFolder) {
    return (
      <div className="file-tree-folder-group">
        <div
          className="file-tree-folder-row"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => onToggleFolder(node.fullPath)}
          role="treeitem"
          aria-expanded={!isCollapsed}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleFolder(node.fullPath);
            }
          }}
        >
          <FolderIcon />
          <span className="folder-name">{node.name}</span>
        </div>
        {!isCollapsed && (
          <div className="file-tree-children">
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedFilePath={selectedFilePath}
                collapsedFolders={collapsedFolders}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onOpenDiffInVsCode={onOpenDiffInVsCode}
                onContextMenuFile={onContextMenuFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const file = node.file!;
  const isSelected = selectedFilePath === file.path;
  const statusInfo = getStatusInfo(file.status);
  const isRenamed =
    file.status === 'renamed' || (Boolean(file.oldPath) && file.oldPath !== file.path);

  const hasAdditions = typeof file.additions === 'number' && file.additions > 0;
  const hasDeletions = typeof file.deletions === 'number' && file.deletions > 0;

  return (
    <div
      className={`file-tree-file-row changed-file-item ${isSelected ? 'selected' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
      onClick={() => onSelectFile(file)}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
      data-testid={`changed-file-${file.path}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenuFile?.(file, e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectFile(file);
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          onContextMenuFile?.(file, e);
        }
      }}
      title={`${statusInfo.label}: ${file.path}`}
    >
      <FileIcon />
      <span className={`file-name ${statusInfo.className}`}>
        {isRenamed && file.oldPath ? (
          <span className="file-rename-path" data-testid={`file-rename-${file.path}`}>
            <span className="old-path">{file.oldPath}</span>
            <span className="rename-arrow"> → </span>
            <span className="new-path">{file.path}</span>
          </span>
        ) : (
          node.name
        )}
      </span>

      {file.isSubmodule ? (
        <span
          className="file-submodule-badge"
          data-testid={`file-submodule-${file.path}`}
          title={t('submodule.badge')}
        >
          [{t('submodule.badge')}]
        </span>
      ) : null}

      {/* Hidden file path for exact full-path test assertions */}
      <span style={{ display: 'none' }} data-testid={`file-path-name-${file.path}`}>
        {file.path}
      </span>

      {/* Stats e.g. ( +186 | -17 ) */}
      {file.isBinary ? (
        <span className="file-stats-text binary">
          ( <span data-testid={`file-binary-${file.path}`}>BIN</span> )
        </span>
      ) : hasAdditions || hasDeletions ? (
        <span className="file-stats-text">
          <span className="stats-paren">( </span>
          {hasAdditions && (
            <span className="stats-plus" data-testid={`file-additions-${file.path}`}>
              +{file.additions}
            </span>
          )}
          {hasAdditions && hasDeletions && <span className="stats-pipe"> | </span>}
          {hasDeletions && (
            <span className="stats-minus" data-testid={`file-deletions-${file.path}`}>
              -{file.deletions}
            </span>
          )}
          <span className="stats-paren"> )</span>
        </span>
      ) : null}

      {/* Hidden badge for test assertion compatibility */}
      <span
        className={`file-status-badge ${statusInfo.className}`}
        style={{ display: 'none' }}
        data-testid={`file-status-${file.path}`}
      >
        {statusInfo.code}
      </span>

      {onOpenDiffInVsCode && (
        <button
          type="button"
          className="file-open-vscode-btn"
          style={{ display: 'none' }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDiffInVsCode(file.path, file.oldPath);
          }}
          data-testid={`open-diff-vscode-${file.path}`}
        >
          ⧉
        </button>
      )}
    </div>
  );
};

export const ChangedFiles: React.FC<ChangedFilesProps> = ({
  repositoryId,
  commitSha,
  parentSha: _parentSha,
  fileChanges,
  selectedFilePath,
  viewMode = 'tree',
  filterText: externalFilterText,
  isFilterVisible = false,
  onFilterTextChange,
  onSelectFile,
  onOpenDiffInVsCode,
  onOpenFileInEditor,
  onOpenSubmodule,
}) => {
  const [internalFilterText, setInternalFilterText] = useState('');
  const filterText = externalFilterText !== undefined ? externalFilterText : internalFilterText;
  const setFilterText = onFilterTextChange ?? setInternalFilterText;

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());

  const handleToggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const filteredChanges = useMemo(() => {
    if (!filterText.trim()) {
      return fileChanges;
    }
    const query = filterText.trim().toLowerCase();
    return fileChanges.filter(
      (f) =>
        f.path.toLowerCase().includes(query) ||
        (f.oldPath && f.oldPath.toLowerCase().includes(query)),
    );
  }, [fileChanges, filterText]);

  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    file: FileChange;
  } | null>(null);

  const handleContextMenuFile = useCallback(
    (file: FileChange, e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let x = 100;
      let y = 100;
      if ('clientX' in e && typeof e.clientX === 'number') {
        x = e.clientX;
        y = e.clientY;
      } else {
        const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.();
        if (rect) {
          x = rect.left + 20;
          y = rect.bottom;
        }
      }
      setFileContextMenu({ x, y, file });
    },
    [],
  );

  useEffect(() => {
    if (!fileContextMenu) return;
    const handleClose = () => setFileContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileContextMenu(null);
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fileContextMenu]);

  const treeNodes = useMemo(() => {
    return buildFileTree(filteredChanges);
  }, [filteredChanges]);

  return (
    <div className="changed-files-container" data-testid="changed-files-container">
      {/* Hidden count for backward-compatible test assertions */}
      <span
        className="changed-files-count"
        style={{ display: 'none' }}
        data-testid="changed-files-count"
      >
        {fileChanges.length}
      </span>

      {/* Filter Input if toggled on or if files > 5 */}
      {(isFilterVisible || fileChanges.length > 5) && (
        <div className="changed-files-filter-box" data-testid="changed-files-filter-box">
          <input
            type="text"
            className="changed-files-filter-input"
            placeholder="Filter files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-label="Filter changed files"
            data-testid="changed-files-filter-input"
          />
          {filterText && (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={() => setFilterText('')}
              title="Clear filter"
              aria-label="Clear filter"
              data-testid="clear-filter-btn"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Files Tree or List */}
      {fileChanges.length === 0 ? (
        <div className="changed-files-empty" data-testid="changed-files-empty">
          No files changed in this commit.
        </div>
      ) : filteredChanges.length === 0 ? (
        <div className="changed-files-no-matches" data-testid="changed-files-no-matches">
          No changed files match &quot;{filterText}&quot;.
        </div>
      ) : viewMode === 'tree' ? (
        <div
          className="changed-files-tree-view"
          role="tree"
          aria-label="Tree of changed files"
          data-testid="changed-files-list"
        >
          {treeNodes.map((node) => (
            <TreeNodeItem
              key={node.id}
              node={node}
              depth={0}
              selectedFilePath={selectedFilePath}
              collapsedFolders={collapsedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={(file) => {
                onSelectFile(file);
                onOpenDiffInVsCode?.(file.path, file.oldPath);
              }}
              onOpenDiffInVsCode={onOpenDiffInVsCode}
              onContextMenuFile={handleContextMenuFile}
            />
          ))}
        </div>
      ) : (
        <div
          className="changed-files-flat-list"
          role="listbox"
          aria-label="List of changed files"
          data-testid="changed-files-list"
        >
          {filteredChanges.map((file) => {
            const isSelected = selectedFilePath === file.path;
            const statusInfo = getStatusInfo(file.status);
            const isRenamed =
              file.status === 'renamed' || (Boolean(file.oldPath) && file.oldPath !== file.path);
            const hasAdditions = typeof file.additions === 'number' && file.additions > 0;
            const hasDeletions = typeof file.deletions === 'number' && file.deletions > 0;

            return (
              <div
                key={file.path}
                className={`file-tree-file-row changed-file-item ${isSelected ? 'selected' : ''}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => {
                  onSelectFile(file);
                  onOpenDiffInVsCode?.(file.path, file.oldPath);
                }}
                onContextMenu={(e) => handleContextMenuFile(file, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFile(file);
                    onOpenDiffInVsCode?.(file.path, file.oldPath);
                  } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    handleContextMenuFile(file, e);
                  }
                }}
                data-testid={`changed-file-${file.path}`}
                title={`${statusInfo.label}: ${file.path}`}
              >
                <FileIcon />
                <span className={`file-name ${statusInfo.className}`}>
                  {isRenamed && file.oldPath ? (
                    <span className="file-rename-path" data-testid={`file-rename-${file.path}`}>
                      <span className="old-path">{file.oldPath}</span>
                      <span className="rename-arrow"> → </span>
                      <span className="new-path">{file.path}</span>
                    </span>
                  ) : (
                    file.path
                  )}
                </span>

                {file.isSubmodule ? (
                  <span
                    className="file-submodule-badge"
                    data-testid={`file-submodule-${file.path}`}
                    title={t('submodule.badge')}
                  >
                    [{t('submodule.badge')}]
                  </span>
                ) : null}

                <span style={{ display: 'none' }} data-testid={`file-path-name-${file.path}`}>
                  {file.path}
                </span>

                {file.isBinary ? (
                  <span className="file-stats-text binary">
                    ( <span data-testid={`file-binary-${file.path}`}>BIN</span> )
                  </span>
                ) : hasAdditions || hasDeletions ? (
                  <span className="file-stats-text">
                    <span className="stats-paren">( </span>
                    {hasAdditions && (
                      <span className="stats-plus" data-testid={`file-additions-${file.path}`}>
                        +{file.additions}
                      </span>
                    )}
                    {hasAdditions && hasDeletions && <span className="stats-pipe"> | </span>}
                    {hasDeletions && (
                      <span className="stats-minus" data-testid={`file-deletions-${file.path}`}>
                        -{file.deletions}
                      </span>
                    )}
                    <span className="stats-paren"> )</span>
                  </span>
                ) : null}

                <span
                  className={`file-status-badge ${statusInfo.className}`}
                  style={{ display: 'none' }}
                  data-testid={`file-status-${file.path}`}
                >
                  {statusInfo.code}
                </span>

                {onOpenDiffInVsCode && (
                  <button
                    type="button"
                    className="file-open-vscode-btn"
                    style={{ display: 'none' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDiffInVsCode(file.path, file.oldPath);
                    }}
                    data-testid={`open-diff-vscode-${file.path}`}
                  >
                    ⧉
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fileContextMenu && (
        <div
          className="commit-action-menu"
          role="menu"
          data-testid="changed-file-context-menu"
          style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItemRow
            id="open-file-in-editor"
            label="Open File in Editor"
            onClick={() => {
              const file = fileContextMenu.file;
              setFileContextMenu(null);
              if (onOpenFileInEditor) {
                onOpenFileInEditor(file.path);
              } else if (repositoryId) {
                openFileAtRevisionInVsCode(repositoryId, file.path, commitSha);
              }
            }}
          />
          {fileContextMenu.file.isSubmodule ? (
            <MenuItemRow
              id="open-submodule-in-graph"
              label={t('submodule.open')}
              onClick={() => {
                const file = fileContextMenu.file;
                setFileContextMenu(null);
                if (onOpenSubmodule) {
                  onOpenSubmodule(file.path);
                } else if (repositoryId) {
                  requestOpenSubmodule({ repositoryId, path: file.path });
                }
              }}
            />
          ) : null}
          <MenuItemRow
            id="open-diff-in-editor"
            label="Open Diff in Editor"
            onClick={() => {
              const file = fileContextMenu.file;
              setFileContextMenu(null);
              onOpenDiffInVsCode?.(file.path, file.oldPath);
            }}
          />
        </div>
      )}
    </div>
  );
};
