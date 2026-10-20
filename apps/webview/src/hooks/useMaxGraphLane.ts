import { useRef } from 'react';
import type { CommitItem } from '../features/graph/CommitRow';

interface MaxLaneCache {
  commits: CommitItem[];
  maxLane: number;
}

function isIdentityPrefix(prefix: CommitItem[], next: CommitItem[]): boolean {
  if (prefix.length === 0 || next.length < prefix.length) return false;
  const lastIndex = prefix.length - 1;
  for (let i = 0; i < prefix.length; i++) {
    if (next[i] === prefix[i]) continue;
    // When a page is appended, the previous page-boundary row is re-flagged and
    // receives a fresh GraphRow object. Its commit and maxLane are unchanged, so
    // tolerate a changed object only at the end of the prefix.
    if (i === lastIndex && next[i]?.hash === prefix[i]?.hash) continue;
    return false;
  }
  return true;
}

/**
 * Tracks the widest graph lane across all commits without rescanning the whole
 * list when a page is appended. Falls back to a full scan when the list is
 * replaced (search, branch switch, refresh).
 */
export function useMaxGraphLane(commits: CommitItem[]): number {
  const cacheRef = useRef<MaxLaneCache>({ commits: [], maxLane: 0 });
  const prev = cacheRef.current;

  if (!isIdentityPrefix(prev.commits, commits)) {
    let maxLane = 0;
    for (const commit of commits) {
      if (commit.graphRow && commit.graphRow.maxLane > maxLane) {
        maxLane = commit.graphRow.maxLane;
      }
    }
    cacheRef.current = { commits, maxLane };
    return maxLane;
  }

  if (commits.length !== prev.commits.length) {
    let maxLane = prev.maxLane;
    for (let i = prev.commits.length; i < commits.length; i++) {
      const row = commits[i]?.graphRow;
      if (row && row.maxLane > maxLane) {
        maxLane = row.maxLane;
      }
    }
    cacheRef.current = { commits, maxLane };
    return maxLane;
  }

  return prev.maxLane;
}
