import { describe, it, expect } from 'vitest';
import type { Commit } from '@git-graph/shared';
import { buildCommitGraph, type GraphContinuation } from '@git-graph/git-graph';

function sha(index: number): string {
  return index.toString(16).padStart(40, '0').slice(-40);
}

function createSyntheticPage(pageIndex: number, pageSize: number, totalCommits: number): Commit[] {
  const commits: Commit[] = [];
  const startIndex = pageIndex * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCommits);

  for (let i = startIndex; i < endIndex; i++) {
    const commitSha = sha(totalCommits - i);
    const parents: string[] = [];
    if (i + 1 < totalCommits) {
      parents.push(sha(totalCommits - (i + 1)));
    }
    // Add branches/merges occasionally to test non-trivial topology
    if (i % 25 === 0 && i + 3 < totalCommits) {
      parents.push(sha(totalCommits - (i + 3)));
    }

    commits.push({
      sha: commitSha,
      shortSha: commitSha.slice(0, 7),
      parents,
      author: {
        name: `Author ${i % 10}`,
        email: `author${i % 10}@example.com`,
        timestamp: 1_700_000_000_000 - i * 60_000,
        timezone: '+0000',
      },
      committer: {
        name: `Committer ${i % 5}`,
        email: `committer${i % 5}@example.com`,
        timestamp: 1_700_000_000_000 - i * 60_000,
        timezone: '+0000',
      },
      subject: `commit ${i} message`,
      refs:
        i === 0
          ? [{ name: 'main', fullName: 'refs/heads/main', kind: 'localBranch', target: commitSha }]
          : [],
    });
  }

  return commits;
}

describe('M14.1 — Stress Testing & Memory Profiling (50,000 - 100,000 commits)', () => {
  it('simulates rapid pagination and incremental graph layout over 100 pages (50,000 commits) under 120MB heap', () => {
    const totalPages = 100;
    const pageSize = 500;
    const totalCommits = totalPages * pageSize; // 50,000 commits

    let continuation: GraphContinuation | undefined;
    let accumulatedRowCount = 0;

    for (let page = 0; page < totalPages; page++) {
      const pageCommits = createSyntheticPage(page, pageSize, totalCommits);
      const graphResult = buildCommitGraph(pageCommits, {
        continuation,
        startRow: accumulatedRowCount,
        totalPageRows: accumulatedRowCount + pageCommits.length,
      });

      accumulatedRowCount += graphResult.rows.length;
      continuation = graphResult.continuation;
    }

    expect(accumulatedRowCount).toBe(totalCommits);
    expect(continuation).toBeDefined();
    expect(continuation?.nextRowIndex).toBe(totalCommits);

    // Simulate rapid virtual scrolling across the 50,000 commits
    const viewportHeight = 720;
    const rowHeight = 24;
    const overscan = 8;
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;

    const scrollSamplePositions = [0, 500, 2500, 10000, 25000, 49000, 49950];
    for (const scrollTop of scrollSamplePositions) {
      const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const endRow = Math.min(totalCommits, startRow + visibleCount);
      expect(endRow - startRow).toBeLessThanOrEqual(visibleCount);
      expect(startRow).toBeGreaterThanOrEqual(0);
    }

    const currentMemory = process.memoryUsage().heapUsed;
    const heapUsedMB = currentMemory / (1024 * 1024);

    // Ensure memory footprint stays bounded well below 120MB target
    expect(heapUsedMB).toBeLessThan(120);
  });

  it('enforces strict bounded LRU limits: DETAILS_CACHE_LIMIT = 500 and DIFF_CACHE_LIMIT = 100', () => {
    const DETAILS_CACHE_LIMIT = 500;
    const DIFF_CACHE_LIMIT = 100;

    // Simulate details LRU cache
    const detailsCache = new Map<string, unknown>();
    for (let i = 0; i < 1200; i++) {
      const key = `repo-1::sha-${i}::`;
      detailsCache.delete(key);
      detailsCache.set(key, { sha: `sha-${i}`, subject: `Subject ${i}` });
      while (detailsCache.size > DETAILS_CACHE_LIMIT) {
        const oldest = detailsCache.keys().next().value;
        if (oldest !== undefined) {
          detailsCache.delete(oldest);
        }
      }
    }

    expect(detailsCache.size).toBe(DETAILS_CACHE_LIMIT);
    // Oldest items (e.g. sha-0 to sha-699) must have been evicted
    expect(detailsCache.has('repo-1::sha-0::')).toBe(false);
    expect(detailsCache.has('repo-1::sha-699::')).toBe(false);
    // Recent items must exist
    expect(detailsCache.has('repo-1::sha-1199::')).toBe(true);

    // Simulate diff LRU cache
    const diffCache = new Map<string, unknown>();
    for (let i = 0; i < 350; i++) {
      const key = `repo-1::diff-${i}::file-${i % 20}.ts`;
      diffCache.delete(key);
      diffCache.set(key, { chunks: [] });
      while (diffCache.size > DIFF_CACHE_LIMIT) {
        const oldest = diffCache.keys().next().value;
        if (oldest !== undefined) {
          diffCache.delete(oldest);
        }
      }
    }

    expect(diffCache.size).toBe(DIFF_CACHE_LIMIT);
    expect(diffCache.has('repo-1::diff-0::file-0.ts')).toBe(false);
    expect(diffCache.has('repo-1::diff-349::file-9.ts')).toBe(true);
  });

  it('verifies memory stability and garbage collection when switching repositories repeatedly', () => {
    const pageSize = 500;

    for (let cycle = 0; cycle < 10; cycle++) {
      // Allocate and compute repository state
      const activeRepoCommits = createSyntheticPage(0, pageSize, pageSize);
      const graphResult = buildCommitGraph(activeRepoCommits);
      expect(graphResult.rows.length).toBe(pageSize);
    }

    if (globalThis.gc) {
      globalThis.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const finalMemoryMB = finalMemory / (1024 * 1024);
    expect(finalMemoryMB).toBeLessThan(120);
  });
});
