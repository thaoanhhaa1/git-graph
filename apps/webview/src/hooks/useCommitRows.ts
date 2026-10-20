import { useMemo, useRef } from 'react';
import type { Commit } from '@git-graph/shared';
import { buildCommitGraph, type GraphContinuation, type GraphRow } from '@git-graph/git-graph';
import type { CommitItem, CommitRefTag } from '../features/graph/CommitRow';
import { normalizeTimestamp } from '../features/common/dateUtils';

export interface NormalizedRef {
  type: CommitRefTag['type'];
  nameLower: string;
}

export interface NormalizedCommit extends CommitItem {
  subjectLower: string;
  authorLower: string;
  hashLower: string;
  shortHashLower: string;
  refsLower: ReadonlyArray<NormalizedRef>;
}

interface GraphCache {
  commits: Commit[];
  rows: GraphRow[];
  continuation: GraphContinuation | undefined;
}

function isIdentityPrefix(prefix: Commit[], next: Commit[]): boolean {
  if (prefix.length === 0 || next.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (next[i] !== prefix[i]) return false;
  }
  return true;
}

function clearBoundaryFlags(row: GraphRow): GraphRow {
  if (!row.segments.some((segment) => segment.isBoundary)) {
    return row;
  }
  return {
    ...row,
    segments: row.segments.map((segment) =>
      segment.isBoundary ? { ...segment, isBoundary: undefined } : segment,
    ),
  };
}

/**
 * Builds graph rows incrementally: when commits are appended to the existing prefix
 * only the new tail is computed using the previous continuation state.
 */
export function useGraphRows(commits: Commit[]): GraphRow[] {
  const cacheRef = useRef<GraphCache>({ commits: [], rows: [], continuation: undefined });

  return useMemo(() => {
    const prev = cacheRef.current;

    if (prev.commits.length > 0 && isIdentityPrefix(prev.commits, commits)) {
      if (commits.length === prev.commits.length) {
        return prev.rows;
      }

      const tail = commits.slice(prev.commits.length);
      const result = buildCommitGraph(tail, {
        continuation: prev.continuation,
        startRow: prev.rows.length,
        totalPageRows: commits.length,
      });
      const tailRows = result.rows as GraphRow[];
      const previousLast = prev.rows[prev.rows.length - 1];
      const rows = previousLast
        ? [...prev.rows.slice(0, -1), clearBoundaryFlags(previousLast), ...tailRows]
        : [...tailRows];

      cacheRef.current = { commits, rows, continuation: result.continuation };
      return rows;
    }

    const result = buildCommitGraph(commits);
    const rows = result.rows as GraphRow[];
    cacheRef.current = { commits, rows, continuation: result.continuation };
    return rows;
  }, [commits]);
}

/**
 * Normalizes raw commits into render-ready rows, reusing cached work per commit
 * instance and only recomputing entries whose inputs changed. Date strings are
 * intentionally left empty so rows format them lazily.
 */
export function useCommitRows(
  rawCommits: Commit[],
  activeCurrentBranch?: string,
): NormalizedCommit[] {
  const graphRows = useGraphRows(rawCommits);
  // Keyed by the Commit object itself: appends reuse the same instances, while a
  // refresh produces new instances so changed refs/messages are re-normalized.
  // The cached value is the fully normalized row so unchanged commits keep a stable
  // object reference, preserving CommitRow memoization and incremental graph scans.
  const cacheRef = useRef<WeakMap<Commit, NormalizedCommit>>(new WeakMap());
  const branchRef = useRef(activeCurrentBranch);

  if (branchRef.current !== activeCurrentBranch) {
    branchRef.current = activeCurrentBranch;
    cacheRef.current = new WeakMap();
  }

  return useMemo(() => {
    const cache = cacheRef.current;

    const rows = rawCommits.map((commit, index) => {
      const graphRow = graphRows[index];
      const cached = cache.get(commit);

      if (cached) {
        if (cached.graphRow === graphRow) {
          return cached;
        }
        // Only the graph row changed (e.g. the previous page boundary row was
        // re-flagged when a new page was appended): keep the normalized fields
        // and swap in the new graph row without re-normalizing the commit.
        const updated = { ...cached, graphRow };
        cache.set(commit, updated);
        return updated;
      }

      const timestamp =
        commit.sha === '*' ? Date.now() : normalizeTimestamp(commit.author.timestamp);
      const isHeadCommit = commit.refs.some((r) => r.kind === 'head' || r.name === 'HEAD');
      const refs = commit.refs.map((r) => {
        const isBranchCurrent =
          Boolean(r.isCurrent) ||
          (isHeadCommit &&
            Boolean(activeCurrentBranch) &&
            (r.kind === 'localBranch' || (r.kind as string) === 'branch') &&
            (r.name === activeCurrentBranch || r.fullName === `refs/heads/${activeCurrentBranch}`));

        return {
          name: r.name,
          fullName: r.fullName,
          type: r.kind,
          upstream: r.upstream,
          tagType: r.tagType,
          targetSha: r.target,
          isCurrent: isBranchCurrent,
        };
      });

      const row: NormalizedCommit = {
        hash: commit.sha,
        shortHash: commit.shortSha,
        message: commit.subject,
        body: commit.body,
        parents: commit.parents,
        author: commit.author.name,
        date: '',
        timestamp,
        graphRow,
        isHead: isHeadCommit,
        refs,
        subjectLower: commit.subject.toLowerCase(),
        authorLower: commit.author.name.toLowerCase(),
        hashLower: commit.sha.toLowerCase(),
        shortHashLower: commit.shortSha.toLowerCase(),
        refsLower: refs.map((r) => ({ type: r.type, nameLower: r.name.toLowerCase() })),
      };
      cache.set(commit, row);
      return row;
    });

    return rows;
  }, [rawCommits, graphRows, activeCurrentBranch]);
}
