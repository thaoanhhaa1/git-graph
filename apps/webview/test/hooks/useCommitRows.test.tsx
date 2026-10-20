// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Commit } from '@git-graph/shared';
import { useCommitRows, type NormalizedCommit } from '../../src/hooks/useCommitRows';

function makeCommit(sha: string, parents: string[] = [], subject = `commit ${sha}`): Commit {
  const identity = {
    name: 'Tester',
    email: 'tester@example.com',
    timestamp: 1700000000000,
    timezone: '+0000',
  };
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: identity,
    committer: identity,
    subject,
    refs: [],
  };
}

describe('useCommitRows', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: NormalizedCommit[] = [];

  const Harness: React.FC<{ commits: Commit[] }> = ({ commits }) => {
    latest = useCommitRows(commits);
    return null;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it('keeps stable row references for reused commits when a page is appended', () => {
    const c = makeCommit('c');
    const b = makeCommit('b', ['c']);
    const a = makeCommit('a', ['b']);

    const pageOne = [a, b];
    act(() => root.render(<Harness commits={pageOne} />));
    const firstRows = latest;
    expect(firstRows).toHaveLength(2);

    const appended = [a, b, c];
    act(() => root.render(<Harness commits={appended} />));

    expect(latest).toHaveLength(3);
    expect(latest[0]).toBe(firstRows[0]);
    expect(latest.map((row) => row.hash)).toEqual(['a', 'b', 'c']);
    expect(latest[2]?.message).toBe('commit c');
  });

  it('re-normalizes when a commit instance is replaced (refresh)', () => {
    const first = [makeCommit('a', [], 'old subject')];
    act(() => root.render(<Harness commits={first} />));
    const firstRows = latest;

    const refreshed = [makeCommit('a', [], 'new subject')];
    act(() => root.render(<Harness commits={refreshed} />));

    expect(latest[0]).not.toBe(firstRows[0]);
    expect(latest[0]?.message).toBe('new subject');
    expect(latest[0]?.subjectLower).toBe('new subject');
  });

  it('returns the same row instances when rendered with the same input array', () => {
    const commits = [makeCommit('a')];
    act(() => root.render(<Harness commits={commits} />));
    const firstRows = latest;

    act(() => root.render(<Harness commits={commits} />));
    expect(latest[0]).toBe(firstRows[0]);
  });
});
