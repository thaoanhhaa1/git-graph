import { useMemo } from 'react';

export interface DistinctOptionsConfig {
  /** Sort the resulting values alphabetically. */
  sort?: boolean;
  /** Return true to skip a candidate value. */
  exclude?: (value: string) => boolean;
}

/**
 * Collects a de-duplicated list of string values from a lazily-evaluated
 * iterable. `getValues` must be referentially stable (e.g. wrapped in
 * `useCallback`) and capture every external data source it reads, so the
 * memoized result is recomputed whenever the underlying data changes.
 */
export function useDistinctOptions(
  getValues: () => Iterable<string>,
  config?: DistinctOptionsConfig,
): string[] {
  const sort = config?.sort ?? false;
  const exclude = config?.exclude;

  return useMemo(() => {
    const set = new Set<string>();
    for (const value of getValues()) {
      if (value && (!exclude || !exclude(value))) {
        set.add(value);
      }
    }
    const result = Array.from(set);
    if (sort) {
      result.sort();
    }
    return result;
  }, [getValues, sort, exclude]);
}
