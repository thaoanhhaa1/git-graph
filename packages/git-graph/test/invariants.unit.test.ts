import { describe, it, expect } from 'vitest';
import type { Commit } from '@git-graph/shared';
import {
  createGraphRow,
  createStraightSegment,
  createBranchSegment,
  validateGraphInvariants,
  assertGraphInvariants,
  assertDeterministicOutput,
  assertInputNotMutated,
  GraphInvariantError,
  type GraphRow,
} from '../src/index';

function createMockCommit(sha: string, parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Author',
      email: 'author@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Committer',
      email: 'committer@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    subject: `Subject ${sha}`,
    refs: [],
  };
}

describe('Graph Invariants Validation', () => {
  it('validates a valid linear graph without errors', () => {
    const commits = [createMockCommit('c2', ['c1']), createMockCommit('c1', [])];

    const rows: GraphRow[] = [
      createGraphRow({
        commit: commits[0]!,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0)],
        maxLane: 0,
      }),
      createGraphRow({
        commit: commits[1]!,
        row: 1,
        lane: 0,
        segments: [],
        maxLane: 0,
      }),
    ];

    const violations = validateGraphInvariants(rows, { enforceParentEdges: true });
    expect(violations).toHaveLength(0);
    expect(() => assertGraphInvariants(rows, { enforceParentEdges: true })).not.toThrow();
  });

  it('fails invariant: exactly one row per commit (detects duplicate commit SHA)', () => {
    const c1 = createMockCommit('c1');
    const rows: GraphRow[] = [
      createGraphRow({ commit: c1, row: 0, lane: 0 }),
      createGraphRow({ commit: c1, row: 1, lane: 0 }),
    ];

    const violations = validateGraphInvariants(rows);
    expect(violations.some((v) => v.code === 'DUPLICATE_COMMIT')).toBe(true);
    expect(() => assertGraphInvariants(rows)).toThrow(GraphInvariantError);
  });

  it('fails invariant: row index must match array index', () => {
    const c1 = createMockCommit('c1');
    const rows: GraphRow[] = [createGraphRow({ commit: c1, row: 5, lane: 0 })];

    const violations = validateGraphInvariants(rows);
    expect(violations.some((v) => v.code === 'INVALID_ROW_INDEX')).toBe(true);
  });

  it('fails invariant: lane index cannot be negative', () => {
    const c1 = createMockCommit('c1');
    const rows: GraphRow[] = [createGraphRow({ commit: c1, row: 0, lane: -1 })];

    const violations = validateGraphInvariants(rows);
    expect(violations.some((v) => v.code === 'NEGATIVE_COORDINATE')).toBe(true);
  });

  it('fails invariant: segment coordinates cannot be negative or exceed maxLane', () => {
    const c1 = createMockCommit('c1');
    const rows: GraphRow[] = [
      createGraphRow({
        commit: c1,
        row: 0,
        lane: 0,
        segments: [
          createBranchSegment(0, 0, 1, 3, 0), // toLane 3 exceeds maxLane 1
        ],
        maxLane: 1,
      }),
    ];

    const violations = validateGraphInvariants(rows, { totalPageRows: 2 });
    expect(violations.some((v) => v.code === 'EXCEEDS_MAX_LANE')).toBe(true);
  });

  it('fails invariant: parent edge must terminate at parent commit if parent is in dataset', () => {
    const commits = [createMockCommit('c2', ['c1']), createMockCommit('c1', [])];

    const rows: GraphRow[] = [
      createGraphRow({
        commit: commits[0]!,
        row: 0,
        lane: 0,
        segments: [], // Missing edge to row 1 (parent c1)
        maxLane: 0,
      }),
      createGraphRow({
        commit: commits[1]!,
        row: 1,
        lane: 0,
        segments: [],
        maxLane: 0,
      }),
    ];

    const violations = validateGraphInvariants(rows, { enforceParentEdges: true });
    expect(violations.some((v) => v.code === 'PARENT_EDGE_NOT_TERMINATED')).toBe(true);
  });

  it('enforces boundary edge invariant: edges reaching beyond page must be marked boundary', () => {
    const commit = createMockCommit('c1', ['parent-outside-page']);
    // Total page rows is 1, but segment reaches row 1 (outside page)
    const rows: GraphRow[] = [
      createGraphRow({
        commit,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0, false)], // not marked as boundary!
        maxLane: 0,
      }),
    ];

    const violations = validateGraphInvariants(rows, { totalPageRows: 1 });
    expect(violations.some((v) => v.code === 'UNMARKED_BOUNDARY_EDGE')).toBe(true);

    // Correcting it to isBoundary = true resolves the violation
    const validRows: GraphRow[] = [
      createGraphRow({
        commit,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0, true)],
        maxLane: 0,
      }),
    ];
    expect(validateGraphInvariants(validRows, { totalPageRows: 1 })).toHaveLength(0);
  });

  it('rejects invalid boundary flag on edges wholly within page', () => {
    const commit = createMockCommit('c1');
    const rows: GraphRow[] = [
      createGraphRow({
        commit,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0, true)], // marked boundary even though page has 2 rows
        maxLane: 0,
      }),
      createGraphRow({
        commit: createMockCommit('c0'),
        row: 1,
        lane: 0,
        segments: [],
        maxLane: 0,
      }),
    ];

    const violations = validateGraphInvariants(rows, { totalPageRows: 2 });
    expect(violations.some((v) => v.code === 'INVALID_BOUNDARY_FLAG')).toBe(true);
  });

  it('verifies deterministic output assertion', () => {
    const commits = [createMockCommit('c2', ['c1']), createMockCommit('c1', [])];

    const deterministicGenerator = (list: readonly Commit[]) => [
      createGraphRow({
        commit: list[0]!,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0)],
        maxLane: 0,
      }),
      createGraphRow({
        commit: list[1]!,
        row: 1,
        lane: 0,
        segments: [],
        maxLane: 0,
      }),
    ];

    expect(() => assertDeterministicOutput(deterministicGenerator, commits)).not.toThrow();

    let counter = 0;
    const nonDeterministicGenerator = (list: readonly Commit[]) => [
      createGraphRow({
        commit: list[0]!,
        row: 0,
        lane: counter++, // changes on every run!
        segments: [],
        maxLane: 0,
      }),
    ];

    expect(() => assertDeterministicOutput(nonDeterministicGenerator, commits)).toThrow(
      GraphInvariantError,
    );
  });

  it('verifies input immutability assertion', () => {
    const original = [createMockCommit('c1'), createMockCommit('c2')];

    const unmutated = [createMockCommit('c1'), createMockCommit('c2')];

    expect(() => assertInputNotMutated(original, unmutated)).not.toThrow();

    const mutated = [
      createMockCommit('c1'),
      { ...createMockCommit('c2'), subject: 'Tampered Subject' },
    ];

    expect(() => assertInputNotMutated(original, mutated)).toThrow(GraphInvariantError);
  });
});
