// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useMaxGraphLane } from '../../src/hooks/useMaxGraphLane';
import type { CommitItem } from '../../src/features/graph/CommitRow';

function makeCommit(hash: string, maxLane: number): CommitItem {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    message: hash,
    author: 'Tester',
    date: '',
    graphRow: { maxLane } as CommitItem['graphRow'],
  };
}

describe('useMaxGraphLane', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest = 0;

  const Harness: React.FC<{ commits: CommitItem[] }> = ({ commits }) => {
    latest = useMaxGraphLane(commits);
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

  it('tracks the widest lane on a full list', () => {
    const commits = [makeCommit('a', 1), makeCommit('b', 4), makeCommit('c', 2)];
    act(() => root.render(<Harness commits={commits} />));
    expect(latest).toBe(4);
  });

  it('reuses the previous result when appending narrower rows', () => {
    const first = [makeCommit('a', 1), makeCommit('b', 4)];
    act(() => root.render(<Harness commits={first} />));
    expect(latest).toBe(4);

    const appended = [...first, makeCommit('c', 2)];
    act(() => root.render(<Harness commits={appended} />));
    expect(latest).toBe(4);
  });

  it('picks up a wider lane from appended rows', () => {
    const first = [makeCommit('a', 1)];
    act(() => root.render(<Harness commits={first} />));
    expect(latest).toBe(1);

    const appended = [...first, makeCommit('b', 7)];
    act(() => root.render(<Harness commits={appended} />));
    expect(latest).toBe(7);
  });

  it('rescans when the list is replaced', () => {
    act(() => root.render(<Harness commits={[makeCommit('a', 9)]} />));
    expect(latest).toBe(9);

    act(() => root.render(<Harness commits={[makeCommit('x', 2), makeCommit('y', 3)]} />));
    expect(latest).toBe(3);
  });

  it('only inspects appended rows when the previous boundary row was re-flagged', () => {
    let reads = 0;
    const tracked = (hash: string, maxLane: number): CommitItem => {
      const graphRow = { maxLane } as CommitItem['graphRow'];
      return {
        hash,
        shortHash: hash.slice(0, 7),
        message: hash,
        author: 'Tester',
        date: '',
        get graphRow() {
          reads += 1;
          return graphRow;
        },
      };
    };

    const a = tracked('a', 1);
    const b = tracked('b', 4);
    act(() => root.render(<Harness commits={[a, b]} />));
    expect(latest).toBe(4);
    reads = 0;

    // Appending a page produces a fresh GraphRow object for the previous
    // boundary commit while keeping the same hash and maxLane.
    const reflaggedB = tracked('b', 4);
    const c = tracked('c', 2);
    act(() => root.render(<Harness commits={[a, reflaggedB, c]} />));

    expect(latest).toBe(4);
    expect(reads).toBe(1);
  });
});
