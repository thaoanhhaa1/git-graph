import { describe, it, expect } from 'vitest';
import type { Commit } from '@git-graph/shared';
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
} from '../src/index';

function makeCommit(sha: string, parents: string[] = [], refNames: string[] = []): Commit {
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
    subject: `Commit ${sha}`,
    refs: refNames.map((name) => ({
      name,
      fullName: `refs/heads/${name}`,
      target: sha,
      kind: 'localBranch',
    })),
  };
}

describe('buildCommitGraph — Topologies and Invariants', () => {
  it('Topology 1: Linear history (A -> B -> C)', () => {
    // Top-to-bottom: C3, C2, C1, C0
    const commits = [
      makeCommit('c3', ['c2']),
      makeCommit('c2', ['c1']),
      makeCommit('c1', ['c0']),
      makeCommit('c0', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(4);

    // All commits should be on lane 0
    for (let r = 0; r < 4; r++) {
      expect(graph[r]!.lane).toBe(0);
      expect(graph[r]!.row).toBe(r);
    }

    // Rows 0, 1, 2 should each have 1 straight segment to the next row
    for (let r = 0; r < 3; r++) {
      expect(graph[r]!.segments).toHaveLength(1);
      const seg = graph[r]!.segments[0]!;
      expect(isStraight(seg)).toBe(true);
      expect(seg.fromRow).toBe(r);
      expect(seg.toRow).toBe(r + 1);
      expect(seg.fromLane).toBe(0);
      expect(seg.toLane).toBe(0);
      expect(seg.colorIndex).toBe(0);
    }

    // Root commit (row 3) has no outgoing segments
    expect(graph[3]!.segments).toHaveLength(0);
    expect(isRootCommitRow(graph[3]!)).toBe(true);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 2: Single unmerged branch', () => {
    // branch commit b1 diverges from main commit m1; m2 is ahead of m1
    // Commits in date order: b1, m2, m1, m0
    const commits = [
      makeCommit('b1', ['m1']),
      makeCommit('m2', ['m1']),
      makeCommit('m1', ['m0']),
      makeCommit('m0', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(4);

    // Row 0: b1 at lane 0. Connects straight to m1
    expect(graph[0]!.lane).toBe(0);
    expect(graph[0]!.commit.sha).toBe('b1');

    // Row 1: m2 at lane 1 (since lane 0 is tracking m1). Parent is m1.
    // Since m1 is already tracked in lane 0, m2 merges into lane 0!
    expect(graph[1]!.lane).toBe(1);
    expect(graph[1]!.commit.sha).toBe('m2');

    // Row 2: m1 at lane 0.
    expect(graph[2]!.lane).toBe(0);
    expect(graph[2]!.commit.sha).toBe('m1');

    // Row 3: m0 at lane 0.
    expect(graph[3]!.lane).toBe(0);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 3: Fast-forward history', () => {
    // Feature branch fast-forwarded: same as linear chain with branch refs
    const commits = [
      makeCommit('c2', ['c1'], ['feature', 'main']),
      makeCommit('c1', ['c0']),
      makeCommit('c0', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(3);
    expect(graph[0]!.lane).toBe(0);
    expect(graph[1]!.lane).toBe(0);
    expect(graph[2]!.lane).toBe(0);

    assertGraphInvariants(graph, { enforceParentEdges: true });
  });

  it('Topology 4: Two-parent merge', () => {
    // m3 merges b1 into m2:
    // m3 (parents: [m2, b1])
    // b1 (parents: [m1])
    // m2 (parents: [m1])
    // m1 (parents: [m0])
    // m0 (root)
    const commits = [
      makeCommit('m3', ['m2', 'b1']),
      makeCommit('b1', ['m1']),
      makeCommit('m2', ['m1']),
      makeCommit('m1', ['m0']),
      makeCommit('m0', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(5);

    // Row 0 (m3): lane 0. First parent m2 straight (lane 0). Second parent b1 branch (lane 1).
    expect(graph[0]!.lane).toBe(0);
    expect(isMergeCommitRow(graph[0]!)).toBe(true);
    const m3Segments = graph[0]!.segments;
    expect(m3Segments).toHaveLength(2);
    expect(isStraight(m3Segments[0]!)).toBe(true);
    expect(m3Segments[0]!.toLane).toBe(0);
    expect(isBranch(m3Segments[1]!)).toBe(true);
    expect(m3Segments[1]!.toLane).toBe(1);

    // Row 1 (b1): lane 1. Lane 0 (tracking m2) passes through!
    expect(graph[1]!.lane).toBe(1);
    const b1Segments = graph[1]!.segments;
    expect(b1Segments.some((s) => isPassThrough(s) && s.fromLane === 0 && s.toLane === 0)).toBe(
      true,
    );

    // Row 2 (m2): lane 0. Parent m1. Since b1 already has parent m1 in lane 1,
    // m2's parent m1 merges with lane 1!
    expect(graph[2]!.lane).toBe(0);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 5: Criss-cross / multiple merge', () => {
    // Criss-cross merge:
    // m_final (parents: [a2, b2])
    // b2 (parents: [b1, a1])
    // a2 (parents: [a1, b1])
    // b1 (parents: [root])
    // a1 (parents: [root])
    // root ()
    const commits = [
      makeCommit('m_final', ['a2', 'b2']),
      makeCommit('b2', ['b1', 'a1']),
      makeCommit('a2', ['a1', 'b1']),
      makeCommit('b1', ['root']),
      makeCommit('a1', ['root']),
      makeCommit('root', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(6);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 6: Multiple concurrent branches (3+ active lanes)', () => {
    // Octopus-like branching: root -> b1, b2, b3 -> merge all
    const commits = [
      makeCommit('merge_all', ['b1', 'b2', 'b3']),
      makeCommit('b3', ['root']),
      makeCommit('b2', ['root']),
      makeCommit('b1', ['root']),
      makeCommit('root', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(5);

    // Merge commit has 3 parents -> 3 outgoing edges
    expect(graph[0]!.segments).toHaveLength(3);
    expect(graph[0]!.maxLane).toBeGreaterThanOrEqual(2);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 7: Octopus merge (4 parents)', () => {
    const commits = [
      makeCommit('octo', ['p0', 'p1', 'p2', 'p3']),
      makeCommit('p3', ['root']),
      makeCommit('p2', ['root']),
      makeCommit('p1', ['root']),
      makeCommit('p0', ['root']),
      makeCommit('root', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(6);
    expect(graph[0]!.segments).toHaveLength(4);

    assertGraphInvariants(graph, { enforceParentEdges: true });
    assertDeterministicOutput(buildCommitGraph, commits);
  });

  it('Topology 8: Root commit only', () => {
    const commits = [makeCommit('root', [])];
    const graph = buildCommitGraph(commits);

    expect(graph).toHaveLength(1);
    expect(graph[0]!.lane).toBe(0);
    expect(graph[0]!.segments).toHaveLength(0);
    expect(isRootCommitRow(graph[0]!)).toBe(true);

    assertGraphInvariants(graph, { enforceParentEdges: true });
  });

  it('Topology 9: Detached HEAD with multiple refs on one commit', () => {
    const commits = [
      makeCommit('head_commit', ['c1'], ['HEAD', 'main', 'origin/main', 'tag-v1.0']),
      makeCommit('c1', []),
    ];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(2);
    expect(graph[0]!.commit.refs).toHaveLength(4);

    assertGraphInvariants(graph, { enforceParentEdges: true });
  });

  it('Topology 10: Commit with parent outside page (boundary segment)', () => {
    // c1 has parent 'outside_sha' which is not in the page
    const commits = [makeCommit('c1', ['outside_sha'])];

    const graph = buildCommitGraph(commits);
    expect(graph).toHaveLength(1);

    // Outgoing edge to 'outside_sha' should reach row 1 (outside 1-row page) -> boundary!
    expect(graph[0]!.segments).toHaveLength(1);
    const seg = graph[0]!.segments[0]!;
    expect(isBoundarySegment(seg)).toBe(true);
    expect(seg.toRow).toBe(1);

    assertGraphInvariants(graph);
  });

  it('Topology 11: Two consecutive pages connected with continuation', () => {
    const page1Commits = [makeCommit('c3', ['c2', 'b1']), makeCommit('c2', ['c1'])];
    const page2Commits = [
      makeCommit('b1', ['root']),
      makeCommit('c1', ['root']),
      makeCommit('root', []),
    ];

    // 11a: Standalone Page 1 with natural boundary
    const standalonePage1 = buildCommitGraph(page1Commits);
    expect(standalonePage1).toHaveLength(2);
    // At boundary (row 1), segments leaving the page must have isBoundary: true
    expect(standalonePage1[1]!.segments.every((s) => s.isBoundary === true)).toBe(true);
    assertGraphInvariants(standalonePage1);

    // 11b: Two-page continuation with totalPageRows = 5 for seamless stitching
    const page1Graph = buildCommitGraph(page1Commits, { totalPageRows: 5 });
    expect(page1Graph).toHaveLength(2);

    const continuation = page1Graph.continuation;
    expect(continuation).toBeDefined();
    expect(continuation.nextRowIndex).toBe(2);

    const page2Graph = buildCommitGraph(page2Commits, {
      continuation,
      startRow: continuation.nextRowIndex,
      totalPageRows: 5,
    });
    expect(page2Graph).toHaveLength(3);

    // Row numbers in page 2 should continue from page 1
    expect(page2Graph[0]!.row).toBe(2);
    expect(page2Graph[1]!.row).toBe(3);
    expect(page2Graph[2]!.row).toBe(4);

    // b1 was tracked in page 1's branch lane (lane 1), so b1 continues at lane 1
    expect(page2Graph[0]!.lane).toBe(1);

    // Combined rows validate all graph invariants
    const combinedRows = [...page1Graph, ...page2Graph];
    assertGraphInvariants(combinedRows, { enforceParentEdges: true });
  });

  it('Invariant Assertion: Does not mutate input commit array', () => {
    const commits = [makeCommit('c2', ['c1']), makeCommit('c1', ['c0']), makeCommit('c0', [])];

    const commitsClone = JSON.parse(JSON.stringify(commits)) as Commit[];
    buildCommitGraph(commits);
    assertInputNotMutated(commitsClone, commits);
  });

  it('Performance Benchmark: Processes 10,000 synthetic commits under 300ms', () => {
    // Generate 10k synthetic commits with periodic merges and branches
    const count = 10_000;
    const commits: Commit[] = [];

    for (let i = 0; i < count; i++) {
      const sha = `sha_${i}`;
      let parents: string[] = [];

      if (i < count - 1) {
        if (i % 20 === 0 && i < count - 2) {
          // Merge commit
          parents = [`sha_${i + 1}`, `sha_${i + 2}`];
        } else {
          // Normal linear commit
          parents = [`sha_${i + 1}`];
        }
      }

      commits.push(makeCommit(sha, parents));
    }

    const startTime = performance.now();
    const result = buildCommitGraph(commits);
    const duration = performance.now() - startTime;

    expect(result).toHaveLength(count);
    expect(duration).toBeLessThan(300); // Must be under 300ms
  });
});
