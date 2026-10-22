import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GitRef, OperationCheckoutTargetType, OperationResetMode } from '@git-graph/shared';
import { MenuItemRow, MenuSeparator } from './Menu';

export interface CommitContextMenuProps {
  x: number;
  y: number;
  commitSha: string;
  commitMessage?: string;
  parents?: string[];
  body?: string;
  refs?: GitRef[];
  targetRef?: GitRef;
  onClose: () => void;
  onViewCommit?: (sha: string) => void;
  onViewDetails?: (sha: string) => void; // Backward compatibility alias for onViewCommit
  onViewChanges?: (sha: string) => void;
  onCompareWithParent?: (sha: string, parentSha?: string) => void;
  onCompareWith?: (target: string) => void;
  onCopySha?: (sha: string) => void;
  onCopyMessage?: (message: string) => void;
  onCheckout?: (target: string, targetType: OperationCheckoutTargetType) => void;
  onCreateBranch?: (startPoint: string) => void;
  onCreateTag?: (target: string) => void;
  onDeleteTag?: (tagName: string) => void;
  onRenameBranch?: (branchName: string) => void;
  onDeleteBranch?: (branchName: string) => void;
  onPushBranch?: (branchName: string) => void;
  onPullBranch?: (branchName: string) => void;
  onCreateArchive?: (target: string) => void;
  onToggleSelectBranch?: (branchName: string) => void;
  onPinBranch?: (branchName: string) => void;
  onCherryPick?: (
    commit: string,
    noCommitOrParentIndex?: boolean | number,
    options?: { promptRange?: boolean; targetBranch?: string },
  ) => void;
  onFixup?: (commitSha: string) => void;
  onSquashCommit?: (commitSha: string) => void;
  onRevert?: (commitSha: string) => void;
  onResetLastCommit?: (commitSha: string) => void;
  onEditMessage?: (commitSha: string) => void;
  onDropCommit?: (commitSha: string) => void;
  onMerge?: (
    target: string,
    squash?: boolean,
    options?: { exclusive?: boolean; targetBranch?: string },
  ) => void;
  onRebase?: (target: string) => void;
  onInteractiveRebase?: (commitSha: string) => void;
  onReset?: (target: string, mode: OperationResetMode) => void;
  onSelectForCompare?: (commitSha: string) => void;
  onPinCommit?: (commitSha: string) => void;
}

export interface MenuItem {
  id: string;
  label: string;
  action: () => void;
  disabled?: boolean;
  title?: string;
  isSeparator?: false;
}

export interface MenuSeparator {
  isSeparator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

/**
 * Copies text to clipboard safely with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand below
  }

  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }
  return false;
}

export const CommitContextMenu: React.FC<CommitContextMenuProps> = ({
  x,
  y,
  commitSha,
  commitMessage = '',
  parents = [],
  body,
  targetRef,
  onClose,
  onViewCommit,
  onViewDetails,
  onCompareWithParent,
  onCompareWith,
  onCopySha,
  onCopyMessage,
  onCheckout,
  onCreateBranch,
  onCreateTag,
  onDeleteTag,
  onRenameBranch,
  onDeleteBranch,
  onPushBranch,
  onPullBranch,
  onCreateArchive,
  onToggleSelectBranch,
  onPinBranch,
  onCherryPick,
  onFixup,
  onSquashCommit,
  onRevert,
  onResetLastCommit,
  onEditMessage,
  onDropCommit,
  onMerge,
  onRebase,
  onInteractiveRebase,
  onReset,
  onSelectForCompare,
  onPinCommit,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  const handleViewCommit = useCallback(() => {
    const handler = onViewCommit ?? onViewDetails;
    handler?.(commitSha);
  }, [commitSha, onViewCommit, onViewDetails]);

  const handleCompareParent = useCallback(
    (parentSha?: string) => {
      onCompareWithParent?.(commitSha, parentSha);
    },
    [commitSha, onCompareWithParent],
  );

  const handleCopySha = useCallback(async () => {
    if (onCopySha) {
      onCopySha(commitSha);
    } else {
      await copyToClipboard(commitSha);
    }
  }, [commitSha, onCopySha]);

  const handleCopyMessage = useCallback(async () => {
    const textToCopy = body && body.trim() ? `${commitMessage}\n\n${body.trim()}` : commitMessage;
    if (onCopyMessage) {
      onCopyMessage(textToCopy);
    } else {
      await copyToClipboard(textToCopy);
    }
  }, [commitMessage, body, onCopyMessage]);

  const menuEntries: MenuEntry[] = useMemo(() => {
    const entries: MenuEntry[] = [];

    // =========================================================================
    // BRANCH / TAG BADGE CONTEXT MENU (Image 1)
    // =========================================================================
    if (targetRef) {
      const targetType = targetRef.kind as OperationCheckoutTargetType;
      const isBranch = targetRef.kind === 'localBranch' || targetRef.kind === 'remoteBranch';
      const isTag = targetRef.kind === 'tag';

      if (isBranch) {
        // 1. Compare with...
        entries.push({
          id: 'compare-branch',
          label: 'Compare with...',
          action: () => {
            if (onCompareWith) {
              onCompareWith(targetRef.name);
            } else if (onCompareWithParent) {
              onCompareWithParent(commitSha);
            }
            onClose();
          },
        });

        // 2. Rename Branch...
        entries.push({
          id: 'rename-branch',
          label: 'Rename Branch...',
          action: () => {
            onRenameBranch?.(targetRef.name);
            onClose();
          },
        });

        // 3. Delete Branch...
        entries.push({
          id: 'delete-branch',
          label: 'Delete Branch...',
          action: () => {
            onDeleteBranch?.(targetRef.name);
            onClose();
          },
        });

        // 4. Create Branch...
        entries.push({
          id: 'create-branch',
          label: 'Create Branch...',
          action: () => {
            onCreateBranch?.(commitSha);
            onClose();
          },
        });

        // 4. Push Branch...
        entries.push({
          id: 'push-branch',
          label: 'Push Branch...',
          action: () => {
            onPushBranch?.(targetRef.name);
            onClose();
          },
        });

        // 5. Pull Branch...
        entries.push({
          id: 'pull-branch',
          label: 'Pull Branch...',
          action: () => {
            onPullBranch?.(targetRef.name);
            onClose();
          },
        });

        // Checkout & Merge Branch operations
        if (!targetRef.isCurrent && (onCheckout || onMerge || onRebase)) {
          entries.push({ isSeparator: true });

          if (onCheckout && !targetRef.isSymbolic) {
            const labelPrefix =
              targetType === 'localBranch' ? 'Checkout Branch' : 'Checkout Remote Branch';
            entries.push({
              id: `checkout-${targetType}-${targetRef.fullName}`,
              label: `${labelPrefix} ${targetRef.name}`,
              action: () => {
                onCheckout(targetRef.fullName, targetType);
                onClose();
              },
            });
          }

          if (onMerge) {
            const labelPrefix =
              targetType === 'remoteBranch' ? 'Merge Remote Branch' : 'Merge Branch';
            entries.push({
              id: `merge-branch-${targetRef.name}`,
              label: `${labelPrefix} '${targetRef.name}' into Current Branch`,
              action: () => {
                onMerge(targetRef.name, false);
                onClose();
              },
            });

            entries.push({
              id: `squash-merge-branch-${targetRef.name}`,
              label: `Squash Merge Branch '${targetRef.name}' into Current Branch`,
              title: `Squash only commits belonging to branch '${targetRef.name}' into current branch as staged changes without parent branch commits.`,
              action: () => {
                onMerge(targetRef.name, true, {
                  exclusive: true,
                  targetBranch: targetRef.name,
                });
                onClose();
              },
            });
          }

          if (onRebase) {
            entries.push({
              id: `rebase-branch-${targetRef.name}`,
              label: `Rebase current branch on this Branch...`,
              action: () => {
                onRebase(targetRef.name);
                onClose();
              },
            });
          }
        }

        // Section 2 of Image 1
        entries.push({ isSeparator: true });

        entries.push({
          id: 'create-archive',
          label: 'Create Archive',
          action: () => {
            onCreateArchive?.(targetRef.name);
            onClose();
          },
        });

        entries.push({
          id: 'unselect-branch',
          label: 'Unselect in Branches Dropdown',
          action: () => {
            onToggleSelectBranch?.(targetRef.name);
            onClose();
          },
        });

        entries.push({
          id: 'copy-name',
          label: 'Copy Branch Name to Clipboard',
          action: async () => {
            await copyToClipboard(targetRef.name);
            onClose();
          },
        });

        // Section 3 of Image 1
        entries.push({ isSeparator: true });

        entries.push({
          id: 'pin-branch',
          label: 'Pin Branch',
          action: () => {
            onPinBranch?.(targetRef.name);
            onClose();
          },
        });

        return entries;
      }

      // TAG CONTEXT MENU
      if (isTag) {
        if (onCheckout) {
          entries.push({
            id: `checkout-tag-${targetRef.fullName}`,
            label: `Checkout Tag ${targetRef.name} (Detached)`,
            action: () => {
              onCheckout(targetRef.fullName, 'tag');
              onClose();
            },
          });
        }

        if (onCreateBranch) {
          entries.push({
            id: 'create-branch',
            label: `Create Branch at ${commitSha.slice(0, 7)}`,
            action: () => {
              onCreateBranch(commitSha);
              onClose();
            },
          });
        }

        entries.push({ isSeparator: true });

        entries.push({
          id: 'create-archive',
          label: 'Create Archive',
          action: () => {
            onCreateArchive?.(targetRef.name);
            onClose();
          },
        });

        entries.push({
          id: 'copy-name',
          label: 'Copy Tag Name to Clipboard',
          action: async () => {
            await copyToClipboard(targetRef.name);
            onClose();
          },
        });

        if (onDeleteTag) {
          entries.push({
            id: `delete-tag-${targetRef.fullName}`,
            label: `Delete Tag ${targetRef.name}...`,
            action: () => {
              onDeleteTag(targetRef.name);
              onClose();
            },
          });
        }

        entries.push({
          id: 'copy-sha',
          label: 'Copy SHA',
          action: () => {
            handleCopySha();
            onClose();
          },
        });

        return entries;
      }
    }

    // =========================================================================
    // COMMIT CONTEXT MENU (Image 2)
    // =========================================================================

    // Top Section
    entries.push({
      id: 'create-tag',
      label: 'Add Tag...',
      action: () => {
        onCreateTag?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'create-branch',
      label: 'Create Branch...',
      action: () => {
        onCreateBranch?.(commitSha);
        onClose();
      },
    });

    entries.push({ isSeparator: true });

    // Commit Actions Section
    entries.push({
      id: 'checkout-commit',
      label: 'Checkout...',
      action: () => {
        onCheckout?.(commitSha, 'commit');
        onClose();
      },
    });

    entries.push({
      id: 'cherry-pick-commit',
      label: 'Cherry Pick...',
      action: () => {
        onCherryPick?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'create-fixup',
      label: 'Fixup into Previous',
      action: () => {
        onFixup?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'create-squash',
      label: 'Create Squash Commit',
      action: () => {
        onSquashCommit?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'revert-commit',
      label: 'Revert...',
      action: () => {
        onRevert?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'reset-last-commit',
      label: 'Reset Last Commit (Soft)...',
      action: () => {
        if (onResetLastCommit) {
          onResetLastCommit(commitSha);
        } else if (onReset) {
          onReset(commitSha, 'soft');
        }
        onClose();
      },
    });

    entries.push({
      id: 'edit-message',
      label: 'Edit Message...',
      action: () => {
        onEditMessage?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'drop-commit',
      label: 'Drop...',
      action: () => {
        onDropCommit?.(commitSha);
        onClose();
      },
    });

    entries.push({ isSeparator: true });

    // Merge & Rebase & Reset Section
    entries.push({
      id: 'merge-commit',
      label: 'Merge into current branch...',
      action: () => {
        onMerge?.(commitSha, false);
        onClose();
      },
    });

    entries.push({
      id: 'squash-merge-commit-only',
      label: 'Squash Merge Commit (Only This Commit)',
      title:
        'Squash only this commit into current branch as staged changes without parent commits.',
      action: () => {
        onMerge?.(commitSha, true, {
          exclusive: true,
        });
        onClose();
      },
    });

    entries.push({
      id: 'squash-merge-commit',
      label: 'Squash Merge into Current Branch (From Merge-Base)',
      title:
        'Standard Git squash merge: merges all commits back to the common ancestor into the current branch.',
      action: () => {
        onMerge?.(commitSha, true);
        onClose();
      },
    });

    entries.push({
      id: 'rebase-commit',
      label: 'Rebase current branch on this Commit...',
      action: () => {
        onRebase?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'interactive-rebase-commit',
      label: 'Interactive Rebase from Here...',
      action: () => {
        onInteractiveRebase?.(commitSha);
        onClose();
      },
    });

    entries.push({
      id: 'reset-commit',
      label: 'Reset current branch to this Commit...',
      action: () => {
        onReset?.(commitSha, 'mixed');
        onClose();
      },
    });

    // Clipboard Section
    entries.push({ isSeparator: true });

    entries.push({
      id: 'copy-sha',
      label: 'Copy Commit Hash to Clipboard',
      action: () => {
        handleCopySha();
        onClose();
      },
    });

    entries.push({
      id: 'copy-message',
      label: 'Copy Commit Subject to Clipboard',
      action: () => {
        handleCopyMessage();
        onClose();
      },
    });

    // Comparison & View Section
    entries.push({ isSeparator: true });

    entries.push({
      id: 'select-for-compare',
      label: 'Select for Compare',
      action: () => {
        if (onSelectForCompare) {
          onSelectForCompare(commitSha);
        } else if (onCompareWithParent) {
          onCompareWithParent(commitSha);
        }
        onClose();
      },
    });

    if (!parents || parents.length === 0) {
      entries.push({
        id: 'compare-parent',
        label: 'Compare with Parent',
        disabled: true,
        title: 'Initial / root commit has no parent to compare with',
        action: () => {},
      });
    } else if (parents.length === 1) {
      entries.push({
        id: 'compare-parent',
        label: 'Compare with Parent',
        title: `Compare with parent ${parents[0]}`,
        action: () => {
          handleCompareParent(parents[0]);
          onClose();
        },
      });
    } else {
      parents.forEach((parentSha, index) => {
        const parentIndex = index + 1;
        entries.push({
          id: index === 0 ? 'compare-parent' : `compare-parent-${parentIndex}`,
          label: `Compare with Parent ${parentIndex} (${parentSha.slice(0, 7)})`,
          title: `Compare with Parent ${parentIndex} (${parentSha})`,
          action: () => {
            handleCompareParent(parentSha);
            onClose();
          },
        });
      });
    }

    entries.push({
      id: 'view-commit',
      label: 'View Commit',
      action: () => {
        handleViewCommit();
        onClose();
      },
    });

    // Pin Commit Section
    entries.push({ isSeparator: true });

    entries.push({
      id: 'pin-commit',
      label: 'Pin Commit',
      action: () => {
        onPinCommit?.(commitSha);
        onClose();
      },
    });

    return entries;
  }, [
    targetRef,
    parents,
    commitSha,
    commitMessage,
    handleViewCommit,
    handleCompareParent,
    handleCopySha,
    handleCopyMessage,
    onCompareWith,
    onRenameBranch,
    onDeleteBranch,
    onCreateBranch,
    onPushBranch,
    onPullBranch,
    onCreateArchive,
    onToggleSelectBranch,
    onPinBranch,
    onCheckout,
    onCreateTag,
    onDeleteTag,
    onCherryPick,
    onFixup,
    onSquashCommit,
    onRevert,
    onResetLastCommit,
    onEditMessage,
    onDropCommit,
    onMerge,
    onRebase,
    onInteractiveRebase,
    onReset,
    onSelectForCompare,
    onPinCommit,
    onClose,
  ]);

  // List of indices that can receive focus (non-separator and non-disabled)
  const selectableIndices = useMemo(() => {
    return menuEntries
      .map((entry, idx) => (!('isSeparator' in entry) && !entry.disabled ? idx : -1))
      .filter((idx) => idx !== -1);
  }, [menuEntries]);

  const [focusedIndex, setFocusedIndex] = useState<number>(selectableIndices[0] ?? 0);

  // Keep focusedIndex on a valid selectable item if entries change
  useEffect(() => {
    if (!selectableIndices.includes(focusedIndex)) {
      setFocusedIndex(selectableIndices[0] ?? 0);
    }
  }, [selectableIndices, focusedIndex]);

  // Adjust menu position so it stays entirely within viewport bounds
  useEffect(() => {
    if (menuRef.current && typeof window !== 'undefined') {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let nextX = x;
      let nextY = y;

      if (nextX + rect.width > viewportWidth - 8) {
        nextX = Math.max(8, viewportWidth - rect.width - 8);
      }
      if (nextY + rect.height > viewportHeight - 8) {
        nextY = Math.max(8, viewportHeight - rect.height - 8);
      }

      setAdjustedPos({ x: nextX, y: nextY });
      menuRef.current.focus();
    }
  }, [x, y]);

  // Close when clicking outside or scrolling
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (selectableIndices.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      return;
    }

    const currentSelectablePos = selectableIndices.indexOf(focusedIndex);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextPos =
          currentSelectablePos >= 0 ? (currentSelectablePos + 1) % selectableIndices.length : 0;
        setFocusedIndex(selectableIndices[nextPos]!);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevPos =
          currentSelectablePos >= 0
            ? (currentSelectablePos - 1 + selectableIndices.length) % selectableIndices.length
            : selectableIndices.length - 1;
        setFocusedIndex(selectableIndices[prevPos]!);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedIndex(selectableIndices[0]!);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedIndex(selectableIndices[selectableIndices.length - 1]!);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const activeEntry = menuEntries[focusedIndex];
        if (activeEntry && !('isSeparator' in activeEntry) && !activeEntry.disabled) {
          activeEntry.action();
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        onClose();
        break;
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="commit-action-menu"
      role="menu"
      aria-label="Commit Actions"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        top: `${adjustedPos.y}px`,
        left: `${adjustedPos.x}px`,
      }}
      data-testid="commit-action-menu"
    >
      {menuEntries.map((entry, index) => {
        if ('isSeparator' in entry && entry.isSeparator) {
          return <MenuSeparator key={`sep-${index}`} />;
        }

        const item = entry as MenuItem;
        const isFocused = index === focusedIndex;

        return (
          <MenuItemRow
            key={item.id}
            id={item.id}
            label={item.label}
            focused={isFocused}
            disabled={Boolean(item.disabled)}
            title={item.title}
            onClick={item.action}
            onMouseEnter={() => setFocusedIndex(index)}
          />
        );
      })}
    </div>
  );
};
