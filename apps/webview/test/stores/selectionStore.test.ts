import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '../../src/stores/selectionStore';
import { setVsCodeApi } from '../../src/messaging/vscodeApi';

describe('selectionStore', () => {
  beforeEach(() => {
    useSelectionStore.getState().reset();
  });

  it('selects single commit and updates selectedCommitSha', () => {
    useSelectionStore.getState().selectCommit('abc1234');
    expect(useSelectionStore.getState().selectedCommitSha).toBe('abc1234');
  });

  it('selects secondary commit for comparison', () => {
    useSelectionStore.getState().selectCommit('abc1234');
    useSelectionStore.getState().selectSecondaryCommit('def5678');
    expect(useSelectionStore.getState().selectedCommitSha).toBe('abc1234');
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBe('def5678');
  });

  it('clears selection cleanly', () => {
    useSelectionStore.getState().selectCommit('abc1234');
    useSelectionStore.getState().selectSecondaryCommit('def5678');
    useSelectionStore.getState().clearSelection();

    expect(useSelectionStore.getState().selectedCommitSha).toBeNull();
    expect(useSelectionStore.getState().secondarySelectedCommitSha).toBeNull();
  });

  it('toggles detail panel state', () => {
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(false);
    useSelectionStore.getState().setDetailPanelOpen(true);
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(true);
    useSelectionStore.getState().setDetailPanelOpen(false);
    expect(useSelectionStore.getState().isDetailPanelOpen).toBe(false);
  });

  it('manages context menu state', () => {
    expect(useSelectionStore.getState().contextMenu).toBeNull();

    useSelectionStore.getState().openContextMenu({
      x: 100,
      y: 200,
      commitSha: 'a1b2c3d',
      commitMessage: 'feat: add feature',
    });

    expect(useSelectionStore.getState().contextMenu).toEqual({
      isOpen: true,
      x: 100,
      y: 200,
      commitSha: 'a1b2c3d',
      commitMessage: 'feat: add feature',
    });

    useSelectionStore.getState().closeContextMenu();
    expect(useSelectionStore.getState().contextMenu).toBeNull();
  });

  it('stores parents and body in context menu state when provided', () => {
    useSelectionStore.getState().openContextMenu({
      x: 150,
      y: 250,
      commitSha: 'a1b2c3d',
      commitMessage: 'feat: message',
      parents: ['parent1', 'parent2'],
      body: 'Detailed body text',
      refs: [
        {
          name: 'main',
          fullName: 'refs/heads/main',
          target: 'a1b2c3d',
          kind: 'localBranch',
        },
      ],
    });

    expect(useSelectionStore.getState().contextMenu).toEqual({
      isOpen: true,
      x: 150,
      y: 250,
      commitSha: 'a1b2c3d',
      commitMessage: 'feat: message',
      parents: ['parent1', 'parent2'],
      body: 'Detailed body text',
      refs: [
        {
          name: 'main',
          fullName: 'refs/heads/main',
          target: 'a1b2c3d',
          kind: 'localBranch',
        },
      ],
    });
  });

  it('persists selectedCommitSha to vscode state', () => {
    let persisted: unknown = null;
    setVsCodeApi({
      postMessage: () => {},
      getState: () => persisted,
      setState: (s) => {
        persisted = s;
        return s;
      },
    });

    useSelectionStore.getState().selectCommit('feedbeef');
    expect(persisted).toEqual({ selectedCommitSha: 'feedbeef' });

    useSelectionStore.getState().clearSelection();
    expect(persisted).toEqual({ selectedCommitSha: null });
  });
});
