import { beforeEach, describe, expect, it } from 'vitest';
import type { RebasePlanEntry } from '@git-graph/shared';
import { useInteractiveRebaseStore } from '../../src/stores/interactiveRebaseStore';

const entry = (sha: string, subject: string): RebasePlanEntry => ({
  action: 'pick',
  sha,
  shortSha: sha.slice(0, 7),
  subject,
  author: 'Tester',
  date: 0,
});

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'cccccccccccccccccccccccccccccccccccccccc';

const plan = () => [entry(SHA_A, 'oldest'), entry(SHA_B, 'middle'), entry(SHA_C, 'newest')];

describe('interactiveRebaseStore', () => {
  beforeEach(() => {
    useInteractiveRebaseStore.getState().reset();
  });

  it('opens in planning state and stores a pending context-menu action', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: true,
      upstream: 'origin/main',
      initialAction: { sha: SHA_C, action: 'fixup' },
    });

    const state = useInteractiveRebaseStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe('planning');
    expect(state.repositoryId).toBe('repo-1');
    expect(state.isPublished).toBe(true);
    expect(state.upstream).toBe('origin/main');
    expect(state.pendingAction).toEqual({ sha: SHA_C, action: 'fixup' });
  });

  it('normalizes plans to newest-first order and applies the pending action', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
      initialAction: { sha: SHA_B, action: 'reword', message: 'new message' },
    });

    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const state = useInteractiveRebaseStore.getState();
    expect(state.entries.map((item) => item.subject)).toEqual(['newest', 'middle', 'oldest']);
    expect(state.entries[1]).toMatchObject({
      action: 'reword',
      message: 'new message',
    });
    expect(state.pendingAction).toBeNull();
    expect(state.totalSteps).toBe(3);
    expect(state.status).toBe('ready');
  });

  it('defaults a reword message to the commit subject and keeps it when edited', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const store = useInteractiveRebaseStore.getState();
    store.setAction(1, 'reword');
    expect(useInteractiveRebaseStore.getState().entries[1]!.message).toBe('middle');

    store.setMessage(1, 'edited subject');
    expect(useInteractiveRebaseStore.getState().entries[1]!.message).toBe('edited subject');
  });

  it('reorders entries without mutating the previous array', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);

    const before = useInteractiveRebaseStore.getState().entries;
    useInteractiveRebaseStore.getState().reorder(0, 2);

    expect(useInteractiveRebaseStore.getState().entries.map((item) => item.subject)).toEqual([
      'middle',
      'oldest',
      'newest',
    ]);
    expect(before.map((item) => item.subject)).toEqual(['newest', 'middle', 'oldest']);
    expect(useInteractiveRebaseStore.getState().entries).not.toBe(before);
  });

  it('tracks progress and enters conflict state on a failed result', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().startRebase('req-1');

    useInteractiveRebaseStore.getState().receiveProgress({
      requestId: 'req-1',
      progress: 0.66,
    });
    expect(useInteractiveRebaseStore.getState().currentStep).toBe(2);

    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'req-1',
      success: false,
      error: {
        code: 'GIT_COMMAND_FAILED',
        message: 'Interactive rebase stopped with conflicts in 1 file(s).',
        details: {
          rebaseState: {
            inProgress: true,
            completedSteps: 1,
            totalSteps: 4,
            unmergedFiles: ['src/app.ts'],
          },
        },
      },
    });

    const state = useInteractiveRebaseStore.getState();
    expect(state.status).toBe('conflict');
    expect(state.conflicts).toEqual(['src/app.ts']);
    expect(state.currentStep).toBe(1);
    expect(state.totalSteps).toBe(4);
    expect(state.activeRequestId).toBeNull();
  });

  it('continues into a paused state and aborts into the aborted state', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().startRebase('req-1');
    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'req-1',
      success: true,
      data: {
        plan: plan(),
        rebaseState: { inProgress: true, completedSteps: 2, totalSteps: 3 },
      },
    });

    expect(useInteractiveRebaseStore.getState().status).toBe('paused');
    expect(useInteractiveRebaseStore.getState().currentStep).toBe(2);

    useInteractiveRebaseStore.getState().continueRebase('req-2');
    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'req-2',
      success: true,
      data: { action: 'continue', rebaseState: { inProgress: false } },
    });
    expect(useInteractiveRebaseStore.getState().status).toBe('completed');

    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().startRebase('req-3');
    useInteractiveRebaseStore.getState().abortRebase('req-4');
    expect(useInteractiveRebaseStore.getState().status).toBe('aborting');

    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'req-4',
      success: true,
      data: { action: 'abort', rebaseState: { inProgress: false } },
    });
    expect(useInteractiveRebaseStore.getState().status).toBe('aborted');
  });

  it('ignores results for unrelated requests', () => {
    useInteractiveRebaseStore.getState().open({
      repositoryId: 'repo-1',
      onto: SHA_A,
      isPublished: false,
    });
    useInteractiveRebaseStore.getState().receivePlan(plan(), SHA_A);
    useInteractiveRebaseStore.getState().startRebase('req-1');

    useInteractiveRebaseStore.getState().receiveResult({
      requestId: 'other',
      success: true,
      data: { rebaseState: { inProgress: false } },
    });

    expect(useInteractiveRebaseStore.getState().status).toBe('running');
  });
});
