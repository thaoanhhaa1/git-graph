import { describe, it, expect } from 'vitest';
import type { Commit, GitRef } from '@git-graph/shared';
import {
  buildCommitGraph,
  assertGraphInvariants,
  assertDeterministicOutput,
  assertInputNotMutated,
  isStraight,
  isBranch,
  isPassThrough,
  isBoundarySegment,
  isRootCommitRow,
  isMergeCommitRow,
  type GraphRow,
} from '../src/index';

/**
 * Creates a mock commit with required fields.
 */
function makeCommit(
  sha: string,
  parents: string[] = [],
  refs: Array<
    Partial<Omit<GitRef, 'kind'>> & { name: string; kind?: GitRef['kind'] | string }
  > = [],
  subject?: string,
): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    subject: subject ?? `Commit ${sha}`,
    refs: refs.map((ref) => ({
      name: ref.name,
      fullName: ref.fullName ?? `refs/heads/${ref.name}`,
      target: sha,
      kind: (ref.kind ?? 'localBranch') as GitRef['kind'],
    })),
  };
}

/**
 * Formats graph rows into a human-readable string representation for reviewable snapshot tests.
 */
export function formatGraphSnapshot(graph: ReadonlyArray<GraphRow>): string {
  return graph
    .map((row) => {
      const refStr =
        row.commit.refs.length > 0 ? ` (${row.commit.refs.map((r) => r.name).join(', ')})` : '';
      const lines = [
        `Row ${row.row} [lane ${row.lane}, max ${row.maxLane}]: ${row.commit.shortSha} "${row.commit.subject}"${refStr}`,
      ];
      for (const seg of row.segments) {
        const boundStr = seg.isBoundary ? ' [boundary]' : '';
        lines.push(
          `  -> ${seg.kind} (${seg.fromRow},${seg.fromLane}) -> (${seg.toRow},${seg.toLane}) color=${seg.colorIndex}${boundStr}`,
        );
      }
      return lines.join('\n');
    })
    .join('\n');
}

describe('M2.4 — Mandatory Topology Test Suite', () => {
  // -------------------------------------------------------------------------
  // Fixture 1: Linear history
  // -------------------------------------------------------------------------
  it('Fixture 1: Linear history', () => {
    const commits = [
      makeCommit('c3', ['c2'], [{ name: 'main' }], 'feat: commit 3'),
      makeCommit('c2', ['c1'], [], 'feat: commit 2'),
      makeCommit('c1', ['c0'], [], 'feat: commit 1'),
      makeCommit('c0', [], [], 'feat: commit 0'),
    ];

    const graph = buildCommitGraph(commits);

    // Invariant assertions
    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
    assertInputNotMutated(commits, commits);

    // Specific structural invariants
    expect(graph).toHaveLength(4);
    for (let r = 0; r < 4; r++) {
      expect(graph[r]!.lane).toBe(0);
      expect(graph[r]!.row).toBe(r);
    }
    for (let r = 0; r < 3; r++) {
      expect(graph[r]!.segments).toHaveLength(1);
      expect(isStraight(graph[r]!.segments[0]!)).toBe(true);
    }
    expect(isRootCommitRow(graph[3]!)).toBe(true);
    expect(graph[3]!.segments).toHaveLength(0);

    // Snapshot
    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 2: Single unmerged branch
  // -------------------------------------------------------------------------
  it('Fixture 2: Single unmerged branch', () => {
    // b1 diverges from m1, m2 is ahead on main, m0 is root
    const commits = [
      makeCommit('b1', ['m1'], [{ name: 'feature' }], 'feat: branch commit'),
      makeCommit('m2', ['m1'], [{ name: 'main' }], 'feat: main commit 2'),
      makeCommit('m1', ['m0'], [], 'feat: main commit 1'),
      makeCommit('m0', [], [], 'feat: initial commit'),
    ];

    const graph = buildCommitGraph(commits);

    // Invariants
    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    // Row 0 (b1) at lane 0
    expect(graph[0]!.lane).toBe(0);
    // Row 1 (m2) allocated to lane 1
    expect(graph[1]!.lane).toBe(1);
    // Row 2 (m1) is shared parent -> joins at lane 0
    expect(graph[2]!.lane).toBe(0);
    // Row 3 (m0) at lane 0
    expect(graph[3]!.lane).toBe(0);

    // Snapshot
    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 3: Fast-forward history
  // -------------------------------------------------------------------------
  it('Fixture 3: Fast-forward history', () => {
    // Feature branch fast-forwarded: both feature and main point to tip
    const commits = [
      makeCommit('ff2', ['ff1'], [{ name: 'feature' }, { name: 'main' }], 'ff: tip commit'),
      makeCommit('ff1', ['ff0'], [], 'ff: middle commit'),
      makeCommit('ff0', [], [], 'ff: base commit'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(3);
    expect(graph[0]!.commit.refs).toHaveLength(2);
    for (let r = 0; r < 3; r++) {
      expect(graph[r]!.lane).toBe(0);
    }

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 4: Two-parent merge
  // -------------------------------------------------------------------------
  it('Fixture 4: Two-parent merge', () => {
    // m3 merges b1 into m2
    const commits = [
      makeCommit('m3', ['m2', 'b1'], [{ name: 'main' }], 'merge: Merge feature into main'),
      makeCommit('b1', ['m1'], [{ name: 'feature' }], 'feat: feature commit'),
      makeCommit('m2', ['m1'], [], 'chore: main commit before merge'),
      makeCommit('m1', ['m0'], [], 'chore: common ancestor'),
      makeCommit('m0', [], [], 'chore: root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(isMergeCommitRow(graph[0]!)).toBe(true);
    expect(graph[0]!.segments).toHaveLength(2);
    expect(isStraight(graph[0]!.segments[0]!)).toBe(true);
    expect(isBranch(graph[0]!.segments[1]!)).toBe(true);

    // b1 is on lane 1, lane 0 passes through
    expect(graph[1]!.lane).toBe(1);
    expect(graph[1]!.segments.some((s) => isPassThrough(s) && s.fromLane === 0)).toBe(true);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 5: Criss-cross / multiple merge cơ bản
  // -------------------------------------------------------------------------
  it('Fixture 5: Criss-cross / multiple merge', () => {
    const commits = [
      makeCommit('m_final', ['a2', 'b2'], [{ name: 'main' }], 'merge: final criss-cross merge'),
      makeCommit('b2', ['b1', 'a1'], [{ name: 'feat-b' }], 'merge: b2 merged a1'),
      makeCommit('a2', ['a1', 'b1'], [{ name: 'feat-a' }], 'merge: a2 merged b1'),
      makeCommit('b1', ['root'], [], 'feat: b1 on branch B'),
      makeCommit('a1', ['root'], [], 'feat: a1 on branch A'),
      makeCommit('root', [], [], 'chore: initial root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
    expect(graph).toHaveLength(6);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 6: Nhiều branch đồng thời (Multiple concurrent branches)
  // -------------------------------------------------------------------------
  it('Fixture 6: Nhiều branch đồng thời (Multiple concurrent branches)', () => {
    // 4 branches diverging from root, multiple active concurrent lanes
    const commits = [
      makeCommit('m_all', ['b3', 'b2', 'b1'], [{ name: 'main' }], 'merge: join all branches'),
      makeCommit('b3', ['root'], [{ name: 'feat-3' }], 'feat: branch 3'),
      makeCommit('b2', ['root'], [{ name: 'feat-2' }], 'feat: branch 2'),
      makeCommit('b1', ['root'], [{ name: 'feat-1' }], 'feat: branch 1'),
      makeCommit('root', [], [], 'chore: root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(5);
    expect(graph[0]!.maxLane).toBeGreaterThanOrEqual(2);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 7: Octopus merge
  // -------------------------------------------------------------------------
  it('Fixture 7: Octopus merge (4 parents)', () => {
    const commits = [
      makeCommit(
        'octo',
        ['p0', 'p1', 'p2', 'p3'],
        [{ name: 'main' }],
        'merge: octopus merge 4 parents',
      ),
      makeCommit('p3', ['root'], [{ name: 'topic-3' }], 'topic 3'),
      makeCommit('p2', ['root'], [{ name: 'topic-2' }], 'topic 2'),
      makeCommit('p1', ['root'], [{ name: 'topic-1' }], 'topic 1'),
      makeCommit('p0', ['root'], [{ name: 'topic-0' }], 'topic 0'),
      makeCommit('root', [], [], 'root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(6);
    expect(graph[0]!.segments).toHaveLength(4);
    expect(isMergeCommitRow(graph[0]!)).toBe(true);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 8: Root commit
  // -------------------------------------------------------------------------
  it('Fixture 8: Root commit', () => {
    const commits = [makeCommit('root_only', [], [{ name: 'main' }], 'Initial commit')];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(1);
    expect(graph[0]!.lane).toBe(0);
    expect(graph[0]!.segments).toHaveLength(0);
    expect(isRootCommitRow(graph[0]!)).toBe(true);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 9: Detached HEAD
  // -------------------------------------------------------------------------
  it('Fixture 9: Detached HEAD', () => {
    // HEAD points directly to a commit without being on a branch ref
    const commits = [
      makeCommit(
        'd_head',
        ['c1'],
        [{ name: 'HEAD', fullName: 'HEAD', kind: 'detachedHead' }],
        'chore: detached HEAD state commit',
      ),
      makeCommit('c1', ['root'], [{ name: 'main' }], 'feat: commit on main'),
      makeCommit('root', [], [], 'root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(3);
    expect(graph[0]!.commit.refs[0]!.kind).toBe('detachedHead');
    expect(graph[0]!.commit.refs[0]!.name).toBe('HEAD');

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 10: Commit có parent ngoài page
  // -------------------------------------------------------------------------
  it('Fixture 10: Commit có parent ngoài page (boundary segment)', () => {
    // Page with 2 commits whose parents are beyond the page
    const commits = [
      makeCommit(
        'p1_c2',
        ['p1_c1', 'external_parent_a'],
        [{ name: 'main' }],
        'commit with external parent',
      ),
      makeCommit('p1_c1', ['external_parent_b'], [], 'commit with external parent b'),
    ];

    const graph = buildCommitGraph(commits, { totalPageRows: 2 });

    assertGraphInvariants(graph);
    assertDeterministicOutput(buildCommitGraph, commits, { totalPageRows: 2 });

    expect(graph).toHaveLength(2);
    // Outgoing segments leaving row 1 (page boundary) must have isBoundary = true
    const boundarySegments = graph.flatMap((r) => r.segments.filter((s) => s.isBoundary));
    expect(boundarySegments.length).toBeGreaterThanOrEqual(2);
    for (const bSeg of boundarySegments) {
      expect(isBoundarySegment(bSeg)).toBe(true);
      expect(bSeg.toRow).toBeGreaterThanOrEqual(2);
    }

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 11: Hai page nối tiếp nhau
  // -------------------------------------------------------------------------
  it('Fixture 11: Hai page nối tiếp nhau (continuation stitching)', () => {
    const page1Commits = [
      makeCommit('c4', ['c3', 'b2'], [{ name: 'main' }], 'merge feature into main'),
      makeCommit('c3', ['c2'], [], 'main commit 3'),
    ];

    const page2Commits = [
      makeCommit('b2', ['root'], [{ name: 'feature' }], 'feature commit'),
      makeCommit('c2', ['root'], [], 'main commit 2'),
      makeCommit('root', [], [], 'root commit'),
    ];

    const totalRows = page1Commits.length + page2Commits.length;

    // Page 1
    const page1Graph = buildCommitGraph(page1Commits, { totalPageRows: totalRows });
    expect(page1Graph).toHaveLength(2);
    const continuation = page1Graph.continuation;
    expect(continuation).toBeDefined();
    expect(continuation.nextRowIndex).toBe(2);

    // Page 2 continues from Page 1
    const page2Graph = buildCommitGraph(page2Commits, {
      continuation,
      startRow: continuation.nextRowIndex,
      totalPageRows: totalRows,
    });
    expect(page2Graph).toHaveLength(3);

    // Row indices in page 2 continue monotonically
    expect(page2Graph[0]!.row).toBe(2);
    expect(page2Graph[1]!.row).toBe(3);
    expect(page2Graph[2]!.row).toBe(4);

    // Combined rows form valid topological graph
    const combinedRows = [...page1Graph, ...page2Graph];
    assertGraphInvariants(combinedRows, { enforceParentEdges: true });

    // Snapshots of individual pages and combined graph
    expect(formatGraphSnapshot(page1Graph)).toMatchSnapshot();
    expect(formatGraphSnapshot(page2Graph)).toMatchSnapshot();
    expect(formatGraphSnapshot(combinedRows)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // Fixture 12: Nhiều ref cùng trỏ vào một commit
  // -------------------------------------------------------------------------
  it('Fixture 12: Nhiều ref cùng trỏ vào một commit', () => {
    // Single commit has localBranch, remoteBranch, tag, and HEAD
    const commits = [
      makeCommit(
        'multi_ref_c1',
        ['root'],
        [
          { name: 'HEAD', fullName: 'HEAD', kind: 'localBranch' },
          { name: 'main', fullName: 'refs/heads/main', kind: 'localBranch' },
          { name: 'origin/main', fullName: 'refs/remotes/origin/main', kind: 'remoteBranch' },
          { name: 'v1.0.0', fullName: 'refs/tags/v1.0.0', kind: 'tag' },
          { name: 'stash@{0}', fullName: 'refs/stash', kind: 'stash' },
        ],
        'release: release v1.0.0 with multiple refs',
      ),
      makeCommit('root', [], [], 'chore: root'),
    ];

    const graph = buildCommitGraph(commits);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);

    expect(graph).toHaveLength(2);
    expect(graph[0]!.commit.refs).toHaveLength(5);

    expect(formatGraphSnapshot(graph)).toMatchSnapshot();
  });
});
