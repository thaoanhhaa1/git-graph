import { describe, it, expect } from 'vitest';
import type { Commit, GitRef } from '@git-graph/shared';
import {
  normalizeColorIndex,
  DEFAULT_PALETTE_SIZE,
  buildStraightSegment,
  buildBranchSegment,
  buildMergeSegment,
  buildPassThroughSegment,
  buildPassThroughSegments,
  matchAndAttachRefs,
  buildCommitGraph,
  createGraphContinuation,
  getPendingParentShas,
  isParentPending,
  hasPendingLanes,
  getUnconsumedRefs,
  assertGraphInvariants,
  assertInputNotMutated,
} from '../src/index';

function makeCommit(sha: string, parents: string[] = [], refs: GitRef[] = []): Commit {
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
    subject: `Commit ${sha}`,
    refs,
  };
}

function makeRef(name: string, target: string, kind: GitRef['kind'] = 'localBranch'): GitRef {
  return {
    name,
    fullName: `refs/heads/${name}`,
    target,
    kind,
  };
}

describe('M2.3 — buildSegments and Edge Generation', () => {
  describe('normalizeColorIndex', () => {
    it('normalizes within default palette size (8)', () => {
      expect(DEFAULT_PALETTE_SIZE).toBe(8);
      expect(normalizeColorIndex(0)).toBe(0);
      expect(normalizeColorIndex(7)).toBe(7);
      expect(normalizeColorIndex(8)).toBe(0);
      expect(normalizeColorIndex(11)).toBe(3);
    });

    it('handles custom palette sizes', () => {
      expect(normalizeColorIndex(5, 5)).toBe(0);
      expect(normalizeColorIndex(7, 5)).toBe(2);
      expect(normalizeColorIndex(0, 3)).toBe(0);
    });

    it('handles negative color indices safely', () => {
      expect(normalizeColorIndex(-1, 8)).toBe(7);
      expect(normalizeColorIndex(-8, 8)).toBe(0);
      expect(normalizeColorIndex(-9, 8)).toBe(7);
    });

    it('handles non-positive palette sizes gracefully', () => {
      expect(normalizeColorIndex(5, 0)).toBe(0);
      expect(normalizeColorIndex(5, -1)).toBe(0);
    });
  });

  describe('Individual segment builder functions', () => {
    it('builds straight segment with raw or normalized color and boundary', () => {
      const s1 = buildStraightSegment(0, 1, 0, 10);
      expect(s1.kind).toBe('straight');
      expect(s1.fromRow).toBe(0);
      expect(s1.toRow).toBe(1);
      expect(s1.fromLane).toBe(0);
      expect(s1.toLane).toBe(0);
      expect(s1.colorIndex).toBe(10);
      expect(s1.isBoundary).toBeUndefined();

      const s2 = buildStraightSegment(0, 1, 0, 10, { isBoundary: true, paletteSize: 8 });
      expect(s2.colorIndex).toBe(2);
      expect(s2.isBoundary).toBe(true);
    });

    it('builds branch segment with options', () => {
      const b = buildBranchSegment(2, 0, 3, 2, 9, { isBoundary: true, paletteSize: 8 });
      expect(b.kind).toBe('branch');
      expect(b.fromRow).toBe(2);
      expect(b.toRow).toBe(3);
      expect(b.fromLane).toBe(0);
      expect(b.toLane).toBe(2);
      expect(b.colorIndex).toBe(1);
      expect(b.isBoundary).toBe(true);
    });

    it('builds merge segment with options', () => {
      const m = buildMergeSegment(3, 2, 4, 0, 16, { isBoundary: false, paletteSize: 8 });
      expect(m.kind).toBe('merge');
      expect(m.fromRow).toBe(3);
      expect(m.toRow).toBe(4);
      expect(m.fromLane).toBe(2);
      expect(m.toLane).toBe(0);
      expect(m.colorIndex).toBe(0);
      expect(m.isBoundary).toBeUndefined();
    });

    it('builds pass-through segment with options', () => {
      const pt = buildPassThroughSegment(1, 2, 3, 5, { isBoundary: true });
      expect(pt.kind).toBe('pass-through');
      expect(pt.fromRow).toBe(1);
      expect(pt.toRow).toBe(2);
      expect(pt.fromLane).toBe(3);
      expect(pt.toLane).toBe(3);
      expect(pt.colorIndex).toBe(5);
      expect(pt.isBoundary).toBe(true);
    });
  });

  describe('buildPassThroughSegments', () => {
    it('generates pass-through for active lanes ignoring current commit lane', () => {
      const activeLanes = [
        { lane: 0, targetSha: 'p0', colorIndex: 0 },
        null,
        { lane: 2, targetSha: 'p2', colorIndex: 2 },
        { lane: 3, targetSha: 'p3', colorIndex: 9 },
      ];

      // Commit is on lane 2
      const segments = buildPassThroughSegments(activeLanes, 5, 2, false, 8);
      expect(segments).toHaveLength(2);

      // Lane 0 passes through
      expect(segments[0]!.fromLane).toBe(0);
      expect(segments[0]!.toLane).toBe(0);
      expect(segments[0]!.fromRow).toBe(5);
      expect(segments[0]!.toRow).toBe(6);
      expect(segments[0]!.colorIndex).toBe(0);

      // Lane 3 passes through with color 9 % 8 = 1
      expect(segments[1]!.fromLane).toBe(3);
      expect(segments[1]!.toLane).toBe(3);
      expect(segments[1]!.colorIndex).toBe(1);
    });
  });

  describe('matchAndAttachRefs', () => {
    it('returns original array when no external refs provided', () => {
      const commits = [makeCommit('c1')];
      const result = matchAndAttachRefs(commits);
      expect(result.commits).toBe(commits);
      expect(result.unconsumedRefs).toEqual([]);
    });

    it('attaches matching refs to commits without mutating originals', () => {
      const c1 = makeCommit('c1');
      const c2 = makeCommit('c2');
      const commits = [c1, c2];

      const ref1 = makeRef('feature', 'c1');
      const refOutside = makeRef('v2.0', 'outside_c');

      const result = matchAndAttachRefs(commits, [ref1, refOutside]);

      // Original objects not mutated
      expect(c1.refs).toHaveLength(0);
      expect(commits).toHaveLength(2);

      // Result updated
      expect(result.commits[0]!.refs).toHaveLength(1);
      expect(result.commits[0]!.refs[0]?.name).toBe('feature');
      expect(result.commits[1]!.refs).toHaveLength(0);

      // Unconsumed refs outside page retained
      expect(result.unconsumedRefs).toHaveLength(1);
      expect(result.unconsumedRefs[0]?.name).toBe('v2.0');
    });

    it('deduplicates refs by fullName/name if already attached to commit', () => {
      const existingRef = makeRef('main', 'c1');
      const c1 = makeCommit('c1', [], [existingRef]);

      const duplicateRef = makeRef('main', 'c1');
      const result = matchAndAttachRefs([c1], [duplicateRef]);

      expect(result.commits[0]!.refs).toHaveLength(1);
      expect(result.commits[0]!.refs[0]?.name).toBe('main');
      expect(result.unconsumedRefs).toHaveLength(0);
    });
  });

  describe('GraphContinuation Helpers', () => {
    it('creates continuation snapshot and detects pending parent SHAs and lanes', () => {
      const laneState = {
        activeLanes: [
          { lane: 0, targetSha: 'parent-alpha', colorIndex: 0 },
          null,
          { lane: 2, targetSha: 'parent-beta', colorIndex: 1 },
        ],
        maxLane: 2,
        nextColorIndex: 2,
      };

      const externalRefs = [makeRef('tag-outside', 'unknown-sha')];
      const cont = createGraphContinuation(laneState, 15, externalRefs);

      expect(cont.nextRowIndex).toBe(15);
      expect(hasPendingLanes(cont)).toBe(true);
      expect(getPendingParentShas(cont)).toEqual(['parent-alpha', 'parent-beta']);
      expect(isParentPending(cont, 'parent-alpha')).toBe(true);
      expect(isParentPending(cont, 'parent-gamma')).toBe(false);
      expect(getUnconsumedRefs(cont)).toEqual(externalRefs);
    });

    it('handles empty active lanes', () => {
      const laneState = {
        activeLanes: [],
        maxLane: 0,
        nextColorIndex: 0,
      };
      const cont = createGraphContinuation(laneState, 0);

      expect(hasPendingLanes(cont)).toBe(false);
      expect(getPendingParentShas(cont)).toEqual([]);
      expect(getUnconsumedRefs(cont)).toEqual([]);
    });
  });

  describe('Integration with buildCommitGraph', () => {
    it('attaches external refs and propagates outside refs through continuation', () => {
      const page1Commits = [makeCommit('c2', ['c1']), makeCommit('c1', ['c0'])];
      const page2Commits = [makeCommit('c0', [])];

      const refForPage1 = makeRef('v1.0', 'c1');
      const refForPage2 = makeRef('root-tag', 'c0');
      const refOutsideAll = makeRef('unrelated', 'future-commit');

      // Page 1
      const page1 = buildCommitGraph(page1Commits, {
        externalRefs: [refForPage1, refForPage2, refOutsideAll],
        totalPageRows: 3,
      });

      expect(page1[1]!.commit.refs).toHaveLength(1);
      expect(page1[1]!.commit.refs[0]?.name).toBe('v1.0');

      // Continuation captures unconsumed refs
      const cont1 = page1.continuation;
      expect(getUnconsumedRefs(cont1)).toHaveLength(2);
      expect(getPendingParentShas(cont1)).toContain('c0');

      // Page 2 continues with continuation
      const page2 = buildCommitGraph(page2Commits, {
        continuation: cont1,
        startRow: cont1.nextRowIndex,
        totalPageRows: 3,
      });

      // c0 receives root-tag
      expect(page2[0]!.commit.refs).toHaveLength(1);
      expect(page2[0]!.commit.refs[0]?.name).toBe('root-tag');

      // Final continuation still carries refOutsideAll
      expect(getUnconsumedRefs(page2.continuation)).toHaveLength(1);
      expect(getUnconsumedRefs(page2.continuation)[0]?.name).toBe('unrelated');

      assertGraphInvariants([...page1, ...page2], { enforceParentEdges: true });
    });

    it('normalizes colors when paletteSize option is provided', () => {
      // 5 concurrent branches
      const commits = [
        makeCommit('root', ['b1', 'b2', 'b3', 'b4', 'b5']),
        makeCommit('b1', []),
        makeCommit('b2', []),
        makeCommit('b3', []),
        makeCommit('b4', []),
        makeCommit('b5', []),
      ];

      // Palette size 3
      const graph = buildCommitGraph(commits, { paletteSize: 3 });

      for (const row of graph) {
        for (const seg of row.segments) {
          expect(seg.colorIndex).toBeGreaterThanOrEqual(0);
          expect(seg.colorIndex).toBeLessThan(3);
        }
      }
    });

    it('does not mutate input commits array even when attaching refs', () => {
      const c1 = makeCommit('c1');
      const commits = [c1];
      const commitsSnapshot = JSON.parse(JSON.stringify(commits)) as Commit[];

      const ref = makeRef('tag1', 'c1');
      const graph = buildCommitGraph(commits, { externalRefs: [ref] });

      expect(graph[0]!.commit.refs).toHaveLength(1);
      assertInputNotMutated(commitsSnapshot, commits);
    });
  });
});
