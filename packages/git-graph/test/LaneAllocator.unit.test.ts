import { describe, it, expect } from 'vitest';
import {
  LaneAllocator,
  createGraphContinuation,
  isStraight,
  isBranch,
  isMerge,
  isPassThrough,
} from '../src/index';

describe('LaneAllocator Unit Tests', () => {
  it('initializes with default empty state when no argument provided', () => {
    const allocator = new LaneAllocator();
    const state = allocator.getState();

    expect(state.activeLanes).toEqual([]);
    expect(state.maxLane).toBe(0);
    expect(state.nextColorIndex).toBe(0);
  });

  it('initializes from custom LaneState or GraphContinuation', () => {
    const customState = {
      activeLanes: [{ lane: 0, targetSha: 'sha1', colorIndex: 5 }],
      maxLane: 0,
      nextColorIndex: 6,
    };
    const allocFromState = new LaneAllocator(customState);
    expect(allocFromState.getState().nextColorIndex).toBe(6);
    expect(allocFromState.getState().activeLanes[0]?.targetSha).toBe('sha1');

    const continuation = createGraphContinuation(customState, 10);
    const allocFromContinuation = new LaneAllocator(continuation);
    expect(allocFromContinuation.getState().nextColorIndex).toBe(6);
  });

  it('allocates a new lane when commit is not found in active lanes', () => {
    const allocator = new LaneAllocator();
    const alloc1 = allocator.findOrAllocateCommitLane('c1');

    expect(alloc1.lane).toBe(0);
    expect(alloc1.colorIndex).toBe(0);

    // Allocating another untracked commit gets the next free slot (lane 1)
    const alloc2 = allocator.findOrAllocateCommitLane('c2');
    expect(alloc2.lane).toBe(1);
    expect(alloc2.colorIndex).toBe(1);
  });

  it('reuses existing lane when commit is already tracked in active lanes', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('target-c');

    // Simulate looking up target-c
    const found = allocator.findOrAllocateCommitLane('target-c');
    expect(found.lane).toBe(0);
    expect(found.colorIndex).toBe(0);
  });

  it('generates pass-through segments for active lanes that are not the commit lane', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('c1'); // lane 0
    allocator.findOrAllocateCommitLane('c2'); // lane 1

    // Pass-through for commit at lane 0 at row 2
    const ptSegments = allocator.createPassThroughSegments(2, 0, false);
    expect(ptSegments).toHaveLength(1);
    expect(ptSegments[0]!.fromLane).toBe(1);
    expect(ptSegments[0]!.toLane).toBe(1);
    expect(ptSegments[0]!.fromRow).toBe(2);
    expect(ptSegments[0]!.toRow).toBe(3);
    expect(isPassThrough(ptSegments[0]!)).toBe(true);
    expect(ptSegments[0]!.isBoundary).toBeUndefined();

    // Boundary pass-through
    const boundaryPt = allocator.createPassThroughSegments(2, 0, true);
    expect(boundaryPt[0]!.isBoundary).toBe(true);
  });

  it('clears commit token from lane', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('c1');
    allocator.clearCommitToken(0);

    expect(allocator.getState().activeLanes[0]).toBeNull();
  });

  it('handles root commit (no parents)', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('root');
    allocator.clearCommitToken(0);

    const segments = allocator.allocateParents(0, 0, 0, [], false);
    expect(segments).toHaveLength(0);
    allocator.compact();
    expect(allocator.getState().activeLanes).toHaveLength(0);
  });

  it('allocates first parent straight in commit lane when not tracked', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('c1');
    allocator.clearCommitToken(0);

    const segments = allocator.allocateParents(0, 0, 0, ['parent1'], false);
    expect(segments).toHaveLength(1);
    expect(isStraight(segments[0]!)).toBe(true);
    expect(segments[0]!.fromLane).toBe(0);
    expect(segments[0]!.toLane).toBe(0);
    expect(segments[0]!.colorIndex).toBe(0);

    const state = allocator.getState();
    expect(state.activeLanes[0]?.targetSha).toBe('parent1');
  });

  it('creates merge segment when first parent is already in another lane', () => {
    const allocator = new LaneAllocator();
    // Simulate lane 0 tracking 'common-parent'
    allocator.findOrAllocateCommitLane('dummy');
    allocator.clearCommitToken(0);
    allocator.allocateParents(0, 0, 0, ['common-parent'], false);

    // Commit on lane 1 has parent 'common-parent'
    const allocLane1 = allocator.findOrAllocateCommitLane('branch-head');
    expect(allocLane1.lane).toBe(1);
    allocator.clearCommitToken(1);

    const segments = allocator.allocateParents(1, 1, 1, ['common-parent'], false);
    expect(segments).toHaveLength(1);
    expect(isMerge(segments[0]!)).toBe(true);
    expect(segments[0]!.fromLane).toBe(1);
    expect(segments[0]!.toLane).toBe(0);

    // Common parent is not duplicated in lane 1
    const state = allocator.getState();
    expect(state.activeLanes[1]).toBeNull();
    expect(state.activeLanes[0]?.targetSha).toBe('common-parent');
  });

  it('allocates secondary parents into available lanes with branch segments', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('merge-commit');
    allocator.clearCommitToken(0);

    const segments = allocator.allocateParents(0, 0, 0, ['p0', 'p1', 'p2'], false);
    expect(segments).toHaveLength(3);

    // First parent is straight
    expect(isStraight(segments[0]!)).toBe(true);
    expect(segments[0]!.toLane).toBe(0);

    // p1 is branch to lane 1
    expect(isBranch(segments[1]!)).toBe(true);
    expect(segments[1]!.fromLane).toBe(0);
    expect(segments[1]!.toLane).toBe(1);

    // p2 is branch to lane 2
    expect(isBranch(segments[2]!)).toBe(true);
    expect(segments[2]!.fromLane).toBe(0);
    expect(segments[2]!.toLane).toBe(2);

    const state = allocator.getState();
    expect(state.activeLanes[0]?.targetSha).toBe('p0');
    expect(state.activeLanes[1]?.targetSha).toBe('p1');
    expect(state.activeLanes[2]?.targetSha).toBe('p2');
  });

  it('compacts trailing null lanes without shifting occupied lane indices', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('c0'); // lane 0
    allocator.findOrAllocateCommitLane('c1'); // lane 1
    allocator.findOrAllocateCommitLane('c2'); // lane 2

    allocator.clearCommitToken(2);
    allocator.compact();
    expect(allocator.getState().activeLanes).toHaveLength(2);
    expect(allocator.getState().activeLanes[0]?.targetSha).toBe('c0');
    expect(allocator.getState().activeLanes[1]?.targetSha).toBe('c1');

    // Middle null lane is preserved so lane 1 index doesn't shift
    allocator.clearCommitToken(0);
    allocator.compact();
    expect(allocator.getState().activeLanes[0]).toBeNull();
    expect(allocator.getState().activeLanes[1]?.targetSha).toBe('c1');
  });

  it('exports continuation with nextRowIndex', () => {
    const allocator = new LaneAllocator();
    allocator.findOrAllocateCommitLane('c0');
    const cont = allocator.getContinuation(42);

    expect(cont.nextRowIndex).toBe(42);
    expect(cont.laneState.activeLanes[0]?.targetSha).toBe('c0');
  });
});
