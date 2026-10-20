import type { Commit } from '@git-graph/shared';
import type { GraphRow } from './GraphRow';
import type { GraphSegment } from './GraphSegment';

export type InvariantViolationCode =
  | 'DUPLICATE_COMMIT'
  | 'INVALID_ROW_INDEX'
  | 'NEGATIVE_COORDINATE'
  | 'EXCEEDS_MAX_LANE'
  | 'MISSING_PARENT_EDGE'
  | 'PARENT_EDGE_NOT_TERMINATED'
  | 'UNMARKED_BOUNDARY_EDGE'
  | 'INVALID_BOUNDARY_FLAG'
  | 'NON_DETERMINISTIC_OUTPUT'
  | 'INPUT_MUTATED';

export interface InvariantViolation {
  readonly code: InvariantViolationCode;
  readonly message: string;
  readonly row?: number;
  readonly commitSha?: string;
  readonly segment?: GraphSegment;
}

export class GraphInvariantError extends Error {
  readonly violations: ReadonlyArray<InvariantViolation>;

  constructor(violations: ReadonlyArray<InvariantViolation>) {
    const summary = violations
      .map((v) => `[${v.code}] ${v.message}${v.row !== undefined ? ` (at row ${v.row})` : ''}`)
      .join('\n');
    super(`Graph Invariant Violation(s):\n${summary}`);
    this.name = 'GraphInvariantError';
    this.violations = violations;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface InvariantValidationOptions {
  /**
   * Total number of rows in the page / dataset. Defaults to rows.length.
   */
  totalPageRows?: number;
  /**
   * Set to true to enforce that every parent in the dataset has a matching outgoing segment.
   */
  enforceParentEdges?: boolean;
  /**
   * Expected starting row index for paginated slices. Defaults to 0.
   */
  startRow?: number;
}

/**
 * Validates all graph invariants for a list of GraphRow items.
 * Returns an array of violations (empty array if completely valid).
 */
export function validateGraphInvariants(
  rows: ReadonlyArray<GraphRow>,
  options: InvariantValidationOptions = {},
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalRows = options.totalPageRows ?? rows.length;
  const startRow = options.startRow ?? 0;
  const commitRowMap = new Map<string, number>();

  // Invariant 1: Exactly one row and node lane per commit; unique commit SHAs; valid row indexing.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const sha = row.commit.sha;
    const expectedRow = startRow + i;

    if (row.row !== expectedRow) {
      violations.push({
        code: 'INVALID_ROW_INDEX',
        message: `Row index ${row.row} does not match expected row ${expectedRow}`,
        row: i,
        commitSha: sha,
      });
    }

    if (commitRowMap.has(sha)) {
      violations.push({
        code: 'DUPLICATE_COMMIT',
        message: `Commit ${sha} appears multiple times in graph rows (rows ${commitRowMap.get(sha)} and ${i})`,
        row: i,
        commitSha: sha,
      });
    } else {
      commitRowMap.set(sha, i);
    }

    // Invariant 2: Lane index non-negative and continuous within row scope.
    if (row.lane < 0 || !Number.isInteger(row.lane)) {
      violations.push({
        code: 'NEGATIVE_COORDINATE',
        message: `Commit node lane must be a non-negative integer, got ${row.lane}`,
        row: i,
        commitSha: sha,
      });
    }

    if (row.maxLane < row.lane) {
      violations.push({
        code: 'EXCEEDS_MAX_LANE',
        message: `Row maxLane ${row.maxLane} is less than commit node lane ${row.lane}`,
        row: i,
        commitSha: sha,
      });
    }

    // Validate segments within row
    for (const segment of row.segments) {
      if (
        segment.fromRow < 0 ||
        segment.toRow < 0 ||
        segment.fromLane < 0 ||
        segment.toLane < 0 ||
        !Number.isInteger(segment.fromRow) ||
        !Number.isInteger(segment.toRow) ||
        !Number.isInteger(segment.fromLane) ||
        !Number.isInteger(segment.toLane)
      ) {
        violations.push({
          code: 'NEGATIVE_COORDINATE',
          message: `Segment coordinates must be non-negative integers: (${segment.fromRow},${segment.fromLane}) -> (${segment.toRow},${segment.toLane})`,
          row: i,
          commitSha: sha,
          segment,
        });
      }

      if (segment.fromLane > row.maxLane || segment.toLane > row.maxLane) {
        violations.push({
          code: 'EXCEEDS_MAX_LANE',
          message: `Segment lanes (${segment.fromLane}, ${segment.toLane}) exceed row maxLane ${row.maxLane}`,
          row: i,
          commitSha: sha,
          segment,
        });
      }

      // Invariant 4: Edge leaving page boundary must be marked boundary.
      const reachesOutsidePage = segment.toRow >= totalRows || segment.fromRow >= totalRows;

      if (reachesOutsidePage && !segment.isBoundary) {
        violations.push({
          code: 'UNMARKED_BOUNDARY_EDGE',
          message: `Segment to row ${segment.toRow} extends outside page of ${totalRows} rows but is not marked as boundary`,
          row: i,
          commitSha: sha,
          segment,
        });
      }

      if (!reachesOutsidePage && segment.isBoundary) {
        violations.push({
          code: 'INVALID_BOUNDARY_FLAG',
          message: `Segment to row ${segment.toRow} is within page of ${totalRows} rows but is marked as boundary`,
          row: i,
          commitSha: sha,
          segment,
        });
      }
    }
  }

  // Invariant 3: Parent edge terminates at parent commit if parent is in the dataset
  if (options.enforceParentEdges) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      for (const parentSha of row.commit.parents) {
        const parentRowIndex = commitRowMap.get(parentSha);
        if (parentRowIndex !== undefined) {
          // Parent exists within the dataset
          const hasConnectingSegment = rows.some((r) =>
            r?.segments.some((s) => s.toRow === parentRowIndex && !s.isBoundary),
          );
          if (!hasConnectingSegment && parentRowIndex > i) {
            violations.push({
              code: 'PARENT_EDGE_NOT_TERMINATED',
              message: `Commit ${row.commit.sha} has parent ${parentSha} at row ${parentRowIndex}, but no segment reaches row ${parentRowIndex}`,
              row: i,
              commitSha: row.commit.sha,
            });
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Asserts all graph invariants; throws GraphInvariantError if any violations occur.
 */
export function assertGraphInvariants(
  rows: ReadonlyArray<GraphRow>,
  options: InvariantValidationOptions = {},
): void {
  const violations = validateGraphInvariants(rows, options);
  if (violations.length > 0) {
    throw new GraphInvariantError(violations);
  }
}

/**
 * Asserts that the graph generation function produces deterministic output
 * (same row coordinates, lanes, segments, and color indices) for identical input.
 */
export function assertDeterministicOutput<TInput extends ReadonlyArray<Commit>, TOptions>(
  generateFn: (commits: TInput, options?: TOptions) => ReadonlyArray<GraphRow>,
  commits: TInput,
  options?: TOptions,
): void {
  const inputA = JSON.parse(JSON.stringify(commits)) as TInput;
  const inputB = JSON.parse(JSON.stringify(commits)) as TInput;

  const outputA = generateFn(inputA, options);
  const outputB = generateFn(inputB, options);

  if (outputA.length !== outputB.length) {
    throw new GraphInvariantError([
      {
        code: 'NON_DETERMINISTIC_OUTPUT',
        message: `Outputs have different lengths: ${outputA.length} vs ${outputB.length}`,
      },
    ]);
  }

  for (let i = 0; i < outputA.length; i++) {
    const rowA = outputA[i];
    const rowB = outputB[i];

    if (!rowA || !rowB) {
      throw new GraphInvariantError([
        {
          code: 'NON_DETERMINISTIC_OUTPUT',
          message: `Row at index ${i} is missing in one output run`,
          row: i,
        },
      ]);
    }

    if (
      rowA.row !== rowB.row ||
      rowA.lane !== rowB.lane ||
      rowA.maxLane !== rowB.maxLane ||
      rowA.commit.sha !== rowB.commit.sha
    ) {
      throw new GraphInvariantError([
        {
          code: 'NON_DETERMINISTIC_OUTPUT',
          message: `Row ${i} differs between identical runs: lane ${rowA.lane} vs ${rowB.lane}`,
          row: i,
        },
      ]);
    }

    if (rowA.segments.length !== rowB.segments.length) {
      throw new GraphInvariantError([
        {
          code: 'NON_DETERMINISTIC_OUTPUT',
          message: `Row ${i} segment count differs: ${rowA.segments.length} vs ${rowB.segments.length}`,
          row: i,
        },
      ]);
    }

    for (let j = 0; j < rowA.segments.length; j++) {
      const segA = rowA.segments[j];
      const segB = rowB.segments[j];
      if (!segA || !segB) {
        throw new GraphInvariantError([
          {
            code: 'NON_DETERMINISTIC_OUTPUT',
            message: `Segment ${j} in row ${i} is missing in one run`,
            row: i,
          },
        ]);
      }

      if (
        segA.fromRow !== segB.fromRow ||
        segA.fromLane !== segB.fromLane ||
        segA.toRow !== segB.toRow ||
        segA.toLane !== segB.toLane ||
        segA.kind !== segB.kind ||
        segA.colorIndex !== segB.colorIndex ||
        segA.isBoundary !== segB.isBoundary
      ) {
        throw new GraphInvariantError([
          {
            code: 'NON_DETERMINISTIC_OUTPUT',
            message: `Segment ${j} in row ${i} differs between identical runs`,
            row: i,
            segment: segA,
          },
        ]);
      }
    }
  }
}

/**
 * Asserts that the original commit array was not mutated by the engine.
 */
export function assertInputNotMutated(
  originalCommits: ReadonlyArray<Commit>,
  commitsAfterRun: ReadonlyArray<Commit>,
): void {
  if (originalCommits.length !== commitsAfterRun.length) {
    throw new GraphInvariantError([
      {
        code: 'INPUT_MUTATED',
        message: `Input commits length was modified: ${originalCommits.length} -> ${commitsAfterRun.length}`,
      },
    ]);
  }

  for (let i = 0; i < originalCommits.length; i++) {
    const orig = originalCommits[i];
    const after = commitsAfterRun[i];

    if (!orig || !after) {
      throw new GraphInvariantError([
        {
          code: 'INPUT_MUTATED',
          message: `Commit at index ${i} is undefined`,
          row: i,
        },
      ]);
    }

    if (orig.sha !== after.sha) {
      throw new GraphInvariantError([
        {
          code: 'INPUT_MUTATED',
          message: `Commit sha at index ${i} changed from ${orig.sha} to ${after.sha}`,
          row: i,
        },
      ]);
    }

    if (JSON.stringify(orig) !== JSON.stringify(after)) {
      throw new GraphInvariantError([
        {
          code: 'INPUT_MUTATED',
          message: `Commit object at index ${i} (${orig.sha}) was mutated`,
          row: i,
        },
      ]);
    }
  }
}
