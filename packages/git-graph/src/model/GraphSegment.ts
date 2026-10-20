import type { GraphSegmentKind } from '@git-graph/shared';

export type { GraphSegmentKind };

/**
 * A segment represents a visual link (edge) between two coordinates in the commit graph.
 * Coordinates are expressed as (row, lane) pairs.
 */
export interface GraphSegment {
  readonly fromRow: number;
  readonly fromLane: number;
  readonly toRow: number;
  readonly toLane: number;
  readonly kind: GraphSegmentKind;
  readonly colorIndex: number;
  /**
   * True if this edge connects to a commit outside the current page boundary.
   */
  readonly isBoundary?: boolean;
}

/**
 * Creates a straight segment connecting the same lane across rows.
 */
export function createStraightSegment(
  fromRow: number,
  toRow: number,
  lane: number,
  colorIndex: number,
  isBoundary = false,
): GraphSegment {
  return {
    fromRow,
    fromLane: lane,
    toRow,
    toLane: lane,
    kind: 'straight',
    colorIndex,
    ...(isBoundary ? { isBoundary: true } : {}),
  };
}

/**
 * Creates a branch segment branching out from a commit to a parent in another lane.
 */
export function createBranchSegment(
  fromRow: number,
  fromLane: number,
  toRow: number,
  toLane: number,
  colorIndex: number,
  isBoundary = false,
): GraphSegment {
  return {
    fromRow,
    fromLane,
    toRow,
    toLane,
    kind: 'branch',
    colorIndex,
    ...(isBoundary ? { isBoundary: true } : {}),
  };
}

/**
 * Creates a merge segment merging a branch lane into a target parent lane.
 */
export function createMergeSegment(
  fromRow: number,
  fromLane: number,
  toRow: number,
  toLane: number,
  colorIndex: number,
  isBoundary = false,
): GraphSegment {
  return {
    fromRow,
    fromLane,
    toRow,
    toLane,
    kind: 'merge',
    colorIndex,
    ...(isBoundary ? { isBoundary: true } : {}),
  };
}

/**
 * Creates a pass-through segment representing an active lane passing through a row
 * without being modified by the commit in that row.
 */
export function createPassThroughSegment(
  fromRow: number,
  toRow: number,
  lane: number,
  colorIndex: number,
  isBoundary = false,
): GraphSegment {
  return {
    fromRow,
    fromLane: lane,
    toRow,
    toLane: lane,
    kind: 'pass-through',
    colorIndex,
    ...(isBoundary ? { isBoundary: true } : {}),
  };
}

/**
 * Helper predicates to inspect segment properties.
 */
export function isStraight(segment: GraphSegment): boolean {
  return segment.kind === 'straight';
}

export function isBranch(segment: GraphSegment): boolean {
  return segment.kind === 'branch';
}

export function isMerge(segment: GraphSegment): boolean {
  return segment.kind === 'merge';
}

export function isPassThrough(segment: GraphSegment): boolean {
  return segment.kind === 'pass-through';
}

export function isBoundarySegment(segment: GraphSegment): boolean {
  return Boolean(segment.isBoundary);
}

export function isDownwardSegment(segment: GraphSegment): boolean {
  return segment.toRow >= segment.fromRow;
}
