import type { Commit } from '@git-graph/shared';
import type { GraphSegment } from './GraphSegment';

/**
 * A single row in the rendered commit graph.
 * Represents one commit node located at (row, lane), along with all graph segments passing through or originating from this row.
 */
export interface GraphRow {
  readonly commit: Commit;
  readonly row: number;
  readonly lane: number;
  readonly segments: ReadonlyArray<GraphSegment>;
  readonly maxLane: number;
}

export interface CreateGraphRowParams {
  commit: Commit;
  row: number;
  lane: number;
  segments?: ReadonlyArray<GraphSegment>;
  maxLane?: number;
}

/**
 * Creates a valid immutable GraphRow.
 * Automatically computes maxLane if not explicitly specified.
 */
export function createGraphRow(params: CreateGraphRowParams): GraphRow {
  const segments = params.segments ?? [];
  let computedMaxLane = params.lane;

  if (params.maxLane !== undefined) {
    computedMaxLane = Math.max(params.maxLane, params.lane);
  } else {
    for (const segment of segments) {
      if (segment.fromLane > computedMaxLane) computedMaxLane = segment.fromLane;
      if (segment.toLane > computedMaxLane) computedMaxLane = segment.toLane;
    }
  }

  return {
    commit: params.commit,
    row: params.row,
    lane: params.lane,
    segments,
    maxLane: computedMaxLane,
  };
}

/**
 * Returns true if the commit in this row has no parents (root commit).
 */
export function isRootCommitRow(row: GraphRow): boolean {
  return row.commit.parents.length === 0;
}

/**
 * Returns true if the commit in this row has 2 or more parents (merge commit).
 */
export function isMergeCommitRow(row: GraphRow): boolean {
  return row.commit.parents.length > 1;
}

/**
 * Returns true if this row contains any boundary segments connecting outside the page.
 */
export function hasBoundarySegments(row: GraphRow): boolean {
  return row.segments.some((segment) => Boolean(segment.isBoundary));
}

/**
 * Returns all pass-through segments in this row.
 */
export function getPassThroughSegments(row: GraphRow): GraphSegment[] {
  return row.segments.filter((s) => s.kind === 'pass-through');
}

/**
 * Returns all segments that originate from this commit node (fromLane === row.lane and fromRow === row.row).
 */
export function getNodeOutgoingSegments(row: GraphRow): GraphSegment[] {
  return row.segments.filter(
    (s) => s.fromRow === row.row && s.fromLane === row.lane && s.kind !== 'pass-through',
  );
}
