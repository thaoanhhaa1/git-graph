import { describe, it, expect } from 'vitest';
import type { Commit } from '@git-graph/shared';
import { buildCommitGraph, validateGraphInvariants, assertDeterministicOutput } from '../src/index';

/**
 * Pseudo-random generator with seed for reproducible property-based testing.
 */
function createPrng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates a topologically sorted random commit DAG (children before parents).
 */
function generateRandomCommitDag(
  commitCount: number,
  maxParents: number,
  random: () => number,
): Commit[] {
  const commits: Commit[] = [];

  for (let i = 0; i < commitCount; i++) {
    const sha = `c_${i.toString().padStart(3, '0')}`;
    const parents: string[] = [];

    if (i < commitCount - 1) {
      // Possible parents are any commit with index > i
      const availableParents = Array.from(
        { length: commitCount - (i + 1) },
        (_, idx) => `c_${(i + 1 + idx).toString().padStart(3, '0')}`,
      );

      // Determine parent count: 0 (root), 1 (normal), 2 (merge), up to maxParents
      const roll = random();
      let parentCount = 1;
      if (roll < 0.1 && i > 0) {
        parentCount = 0; // independent root
      } else if (roll > 0.7) {
        parentCount = Math.min(
          maxParents,
          Math.max(2, Math.floor(random() * maxParents) + 1),
          availableParents.length,
        );
      }

      // Pick distinct parents in order
      if (availableParents.length > 0 && parentCount > 0) {
        // Shuffle available parents and take parentCount
        const shuffled = [...availableParents].sort(() => random() - 0.5);
        parents.push(...shuffled.slice(0, parentCount));
      }
    }

    commits.push({
      sha,
      shortSha: sha.slice(0, 7),
      parents,
      author: {
        name: 'Dev',
        email: 'dev@example.com',
        timestamp: 1700000000 + i * 60,
        timezone: '+0000',
      },
      committer: {
        name: 'Dev',
        email: 'dev@example.com',
        timestamp: 1700000000 + i * 60,
        timezone: '+0000',
      },
      subject: `Random commit ${sha}`,
      refs:
        i === 0
          ? [{ name: 'HEAD', fullName: 'HEAD', target: sha, kind: 'localBranch' }]
          : random() > 0.8
            ? [{ name: `b_${i}`, fullName: `refs/heads/b_${i}`, target: sha, kind: 'localBranch' }]
            : [],
    });
  }

  return commits;
}

describe('M2.4 — Property-Based Tests for Random Topologies', () => {
  const prng = createPrng(42);

  it('Property: Invariants hold on 40 generated arbitrary topologies', () => {
    for (let testIdx = 0; testIdx < 40; testIdx++) {
      const commitCount = 5 + Math.floor(prng() * 45); // 5 to 50 commits
      const maxParents = 1 + Math.floor(prng() * 4); // 1 to 4 parents
      const commits = generateRandomCommitDag(commitCount, maxParents, prng);

      const graph = buildCommitGraph(commits);

      // Property 1: No negative lanes or coordinates
      for (const row of graph) {
        expect(row.lane).toBeGreaterThanOrEqual(0);
        expect(row.maxLane).toBeGreaterThanOrEqual(0);
        expect(row.maxLane).toBeGreaterThanOrEqual(row.lane);

        for (const seg of row.segments) {
          expect(seg.fromLane).toBeGreaterThanOrEqual(0);
          expect(seg.toLane).toBeGreaterThanOrEqual(0);
          expect(seg.fromRow).toBeGreaterThanOrEqual(0);
          expect(seg.toRow).toBeGreaterThanOrEqual(0);
          expect(seg.colorIndex).toBeGreaterThanOrEqual(0);
        }
      }

      // Property 2: No duplicate nodes / rows, row index matches array position
      expect(graph).toHaveLength(commits.length);
      const visitedShas = new Set<string>();
      for (let i = 0; i < graph.length; i++) {
        const row = graph[i]!;
        expect(row.row).toBe(i);
        expect(visitedShas.has(row.commit.sha)).toBe(false);
        visitedShas.add(row.commit.sha);
      }
      expect(visitedShas.size).toBe(commits.length);

      // Property 3: Edge endpoints are valid
      for (let i = 0; i < graph.length; i++) {
        const row = graph[i]!;
        const nextRow = graph[i + 1];

        for (const seg of row.segments) {
          expect(seg.fromRow).toBe(row.row);
          expect(seg.toRow).toBe(row.row + 1);
          expect(seg.fromLane).toBeLessThanOrEqual(row.maxLane);
          if (nextRow) {
            expect(seg.toLane).toBeLessThanOrEqual(nextRow.maxLane);
          }
        }
      }

      // Property 4: Independent invariant validation returns zero violations
      const violations = validateGraphInvariants(graph, { enforceParentEdges: true });
      if (violations.length > 0) {
        console.error(`Violation in test ${testIdx}:`, violations);
      }
      expect(violations).toHaveLength(0);
    }
  });

  it('Property: Invariants hold across multi-page continuations for random topologies', () => {
    for (let testIdx = 0; testIdx < 15; testIdx++) {
      const totalCount = 20 + Math.floor(prng() * 30);
      const commits = generateRandomCommitDag(totalCount, 3, prng);

      // Split into 2 chunks
      const splitPoint = 5 + Math.floor(prng() * (totalCount - 10));
      const page1Commits = commits.slice(0, splitPoint);
      const page2Commits = commits.slice(splitPoint);

      const page1Graph = buildCommitGraph(page1Commits, { totalPageRows: totalCount });
      const continuation = page1Graph.continuation;

      const page2Graph = buildCommitGraph(page2Commits, {
        continuation,
        startRow: continuation.nextRowIndex,
        totalPageRows: totalCount,
      });

      const combined = [...page1Graph, ...page2Graph];

      expect(combined).toHaveLength(totalCount);
      for (let i = 0; i < combined.length; i++) {
        expect(combined[i]!.row).toBe(i);
        expect(combined[i]!.lane).toBeGreaterThanOrEqual(0);
      }

      const violations = validateGraphInvariants(combined, { enforceParentEdges: true });
      expect(violations).toHaveLength(0);
    }
  });

  it('Property: Output is deterministic across random commit graphs', () => {
    const commits = generateRandomCommitDag(25, 3, prng);
    assertDeterministicOutput(buildCommitGraph, commits);
  });
});
