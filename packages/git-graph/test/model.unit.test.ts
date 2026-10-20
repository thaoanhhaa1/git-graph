import { describe, it, expect } from 'vitest';
import type { Commit } from '@git-graph/shared';
import {
  createStraightSegment,
  createBranchSegment,
  createMergeSegment,
  createPassThroughSegment,
  isStraight,
  isBranch,
  isMerge,
  isPassThrough,
  isBoundarySegment,
  isDownwardSegment,
  createInitialLaneState,
  cloneLaneState,
  findActiveLaneBySha,
  findLaneIndexBySha,
  findFirstAvailableLaneIndex,
  setLane,
  clearLane,
  compactLaneState,
  getActiveLanes,
  countActiveLanes,
  createGraphRow,
  isRootCommitRow,
  isMergeCommitRow,
  hasBoundarySegments,
  getPassThroughSegments,
  getNodeOutgoingSegments,
} from '../src/index';

function createMockCommit(sha: string, parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Tester',
      email: 'test@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'test@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    subject: `Commit ${sha}`,
    refs: [],
  };
}

describe('GraphSegment Model', () => {
  it('creates straight segment with correct coordinates and predicates', () => {
    const seg = createStraightSegment(0, 1, 0, 1);
    expect(seg.kind).toBe('straight');
    expect(seg.fromRow).toBe(0);
    expect(seg.fromLane).toBe(0);
    expect(seg.toRow).toBe(1);
    expect(seg.toLane).toBe(0);
    expect(seg.colorIndex).toBe(1);
    expect(seg.isBoundary).toBeUndefined();

    expect(isStraight(seg)).toBe(true);
    expect(isBranch(seg)).toBe(false);
    expect(isMerge(seg)).toBe(false);
    expect(isPassThrough(seg)).toBe(false);
    expect(isBoundarySegment(seg)).toBe(false);
    expect(isDownwardSegment(seg)).toBe(true);
  });

  it('creates branch and merge segments', () => {
    const branch = createBranchSegment(0, 0, 1, 1, 2);
    expect(isBranch(branch)).toBe(true);
    expect(branch.fromLane).toBe(0);
    expect(branch.toLane).toBe(1);
    expect(branch.colorIndex).toBe(2);

    const merge = createMergeSegment(1, 1, 2, 0, 2);
    expect(isMerge(merge)).toBe(true);
    expect(merge.fromLane).toBe(1);
    expect(merge.toLane).toBe(0);
  });

  it('creates pass-through segment with boundary support', () => {
    const pt = createPassThroughSegment(0, 1, 2, 3, true);
    expect(isPassThrough(pt)).toBe(true);
    expect(isBoundarySegment(pt)).toBe(true);
    expect(pt.fromLane).toBe(2);
    expect(pt.toLane).toBe(2);
  });
});

describe('LaneState Model', () => {
  it('initializes and clones lane state correctly', () => {
    const initial = createInitialLaneState(1);
    expect(initial.activeLanes).toEqual([]);
    expect(initial.maxLane).toBe(0);
    expect(initial.nextColorIndex).toBe(1);

    const cloned = cloneLaneState(initial);
    expect(cloned).toEqual(initial);
    expect(cloned.activeLanes).not.toBe(initial.activeLanes);
  });

  it('manages active lanes, allocating and tracking colors', () => {
    let state = createInitialLaneState(0);

    // Allocate lane 0 for sha 'c1'
    state = setLane(state, 0, 'c1');
    expect(state.activeLanes.length).toBe(1);
    expect(state.activeLanes[0]?.targetSha).toBe('c1');
    expect(state.activeLanes[0]?.colorIndex).toBe(0);
    expect(state.nextColorIndex).toBe(1);
    expect(state.maxLane).toBe(0);

    // Allocate lane 1 for sha 'c2' with specific color 5
    state = setLane(state, 1, 'c2', 5);
    expect(state.activeLanes[1]?.targetSha).toBe('c2');
    expect(state.activeLanes[1]?.colorIndex).toBe(5);
    expect(state.maxLane).toBe(1);
    expect(state.nextColorIndex).toBe(6);

    // Find queries
    expect(findLaneIndexBySha(state, 'c2')).toBe(1);
    expect(findLaneIndexBySha(state, 'c99')).toBe(-1);
    expect(findActiveLaneBySha(state, 'c1')?.lane).toBe(0);
    expect(countActiveLanes(state)).toBe(2);
    expect(getActiveLanes(state)).toHaveLength(2);

    // Release lane 0
    state = clearLane(state, 0);
    expect(state.activeLanes[0]).toBeNull();
    expect(countActiveLanes(state)).toBe(1);
    expect(findFirstAvailableLaneIndex(state)).toBe(0);

    // Compact lanes
    state = clearLane(state, 1);
    expect(countActiveLanes(state)).toBe(0);
    state = compactLaneState(state);
    expect(state.activeLanes).toHaveLength(0);
    expect(state.maxLane).toBe(0);
  });
});

describe('GraphRow Model', () => {
  it('computes maxLane automatically from segments and lane', () => {
    const commit = createMockCommit('c1', ['p1']);
    const row = createGraphRow({
      commit,
      row: 0,
      lane: 1,
      segments: [createStraightSegment(0, 1, 1, 0), createBranchSegment(0, 1, 1, 3, 1)],
    });

    expect(row.row).toBe(0);
    expect(row.lane).toBe(1);
    expect(row.maxLane).toBe(3);
    expect(isRootCommitRow(row)).toBe(false);
    expect(isMergeCommitRow(row)).toBe(false);
  });

  it('detects root and merge commits and extracts segments', () => {
    const rootCommit = createMockCommit('root');
    const rootRow = createGraphRow({
      commit: rootCommit,
      row: 2,
      lane: 0,
    });
    expect(isRootCommitRow(rootRow)).toBe(true);
    expect(isMergeCommitRow(rootRow)).toBe(false);

    const mergeCommit = createMockCommit('merge', ['p1', 'p2']);
    const mergeRow = createGraphRow({
      commit: mergeCommit,
      row: 0,
      lane: 0,
      segments: [
        createStraightSegment(0, 1, 0, 0),
        createMergeSegment(0, 1, 1, 0, 1),
        createPassThroughSegment(0, 1, 2, 2),
      ],
    });
    expect(isRootCommitRow(mergeRow)).toBe(false);
    expect(isMergeCommitRow(mergeRow)).toBe(true);

    const passThroughs = getPassThroughSegments(mergeRow);
    expect(passThroughs).toHaveLength(1);
    expect(passThroughs[0]?.fromLane).toBe(2);

    const outgoing = getNodeOutgoingSegments(mergeRow);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.kind).toBe('straight');
  });

  it('identifies rows with boundary segments', () => {
    const rowWithoutBoundary = createGraphRow({
      commit: createMockCommit('c1'),
      row: 0,
      lane: 0,
      segments: [createStraightSegment(0, 1, 0, 0)],
    });
    expect(hasBoundarySegments(rowWithoutBoundary)).toBe(false);

    const rowWithBoundary = createGraphRow({
      commit: createMockCommit('c2'),
      row: 0,
      lane: 0,
      segments: [createStraightSegment(0, 1, 0, 0, true)],
    });
    expect(hasBoundarySegments(rowWithBoundary)).toBe(true);
  });
});
