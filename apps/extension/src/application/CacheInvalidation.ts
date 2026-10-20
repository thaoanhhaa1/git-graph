/**
 * Helper utilities that decide when the {@link RepositoryCache} should be
 * cleared or partially invalidated.  The implementation follows the plan
 * (M6.1) – it reacts to repository‑wide changes such as HEAD moves, fetches,
 * merges, rebase operations, and configuration updates.
 *
 * At MVP stage the logic is simple: callers invoke the exported functions when
 * they know a change occurred.  More sophisticated detection (e.g. listening
 * to git events) can be added later without changing the public API.
 */

import { RepositoryCache } from './RepositoryCache';

/** Invalidate the entire cache for a repository.
 *  This is used when a change could affect any cached datum – for example a
 *  checkout that moves HEAD or a `git fetch` that updates remote refs.
 */
export function invalidateRepository(repoRoot: string): void {
  RepositoryCache.clear(repoRoot);
}

/** Invalidate only the refs snapshot while preserving other cached data.
 *  Useful when the operation only changes branch/tag information.
 */
export function invalidateRefs(repoRoot: string): void {
  const entry = RepositoryCache.getRawEntry(repoRoot);
  if (entry) entry.refs = undefined;
}

/** Invalidate commit pages beyond a certain page key.  The caller passes the
 *  first page that is now stale; all later pages are removed.
 */
export function invalidateCommitPages(repoRoot: string, staleFromPageKey: string): void {
  const entry = RepositoryCache.getRawEntry(repoRoot);
  if (!entry?.commitPages) return;
  const pages = entry.commitPages as Record<string, unknown>;
  for (const key of Object.keys(pages)) {
    if (key >= staleFromPageKey) delete pages[key];
  }
}

// Future helpers (e.g., invalidateGraphContinuation) can be added here.
