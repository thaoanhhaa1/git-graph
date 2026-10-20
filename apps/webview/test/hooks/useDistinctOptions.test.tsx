// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDistinctOptions, type DistinctOptionsConfig } from '../../src/hooks/useDistinctOptions';

describe('useDistinctOptions', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: string[] = [];

  const Harness: React.FC<{
    values: string[];
    sort?: boolean;
    excludeDash?: boolean;
  }> = ({ values, sort, excludeDash }) => {
    const getValues = React.useCallback(() => values, [values]);
    const config = React.useMemo<DistinctOptionsConfig>(
      () => ({
        sort,
        exclude: excludeDash ? (value: string) => value === '-' : undefined,
      }),
      [sort, excludeDash],
    );
    latest = useDistinctOptions(getValues, config);
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

  it('deduplicates values while preserving first-seen order by default', () => {
    act(() => root.render(<Harness values={['b', 'a', 'b', 'c', 'a']} />));
    expect(latest).toEqual(['b', 'a', 'c']);
  });

  it('sorts values when configured', () => {
    act(() => root.render(<Harness values={['b', 'a', 'c']} sort />));
    expect(latest).toEqual(['a', 'b', 'c']);
  });

  it('applies the exclude predicate', () => {
    act(() => root.render(<Harness values={['-', 'a', '-', 'b']} excludeDash />));
    expect(latest).toEqual(['a', 'b']);
  });

  it('recomputes when the value source changes', () => {
    act(() => root.render(<Harness values={['a', 'b']} />));
    expect(latest).toEqual(['a', 'b']);

    act(() => root.render(<Harness values={['a', 'b', 'c']} />));
    expect(latest).toEqual(['a', 'b', 'c']);
  });

  it('recomputes when the sort config changes without other dep changes', () => {
    act(() => root.render(<Harness values={['b', 'a']} />));
    const unsorted = latest;
    expect(unsorted).toEqual(['b', 'a']);

    act(() => root.render(<Harness values={['b', 'a']} sort />));
    expect(latest).toEqual(['a', 'b']);
  });

  it('recomputes when the exclude predicate changes without other dep changes', () => {
    act(() => root.render(<Harness values={['-', 'a']} />));
    expect(latest).toEqual(['-', 'a']);

    act(() => root.render(<Harness values={['-', 'a']} excludeDash />));
    expect(latest).toEqual(['a']);
  });

  it('reuses the memoized array when getValues and config stay stable', () => {
    const values = ['a', 'b'];
    act(() => root.render(<Harness values={values} sort />));
    const first = latest;

    act(() => root.render(<Harness values={values} sort />));
    expect(latest).toBe(first);
  });
});
