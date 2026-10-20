import type { Commit, CommitSha, GitIdentity, GitRef } from '@git-graph/shared';

/**
 * Control characters used to reliably delimit records and fields in git log output.
 * ASCII 0x1E: Record Separator (RS)
 * ASCII 0x1F: Unit/Field Separator (US)
 */
export const RECORD_SEPARATOR = '\x1e';
export const FIELD_SEPARATOR = '\x1f';

/**
 * Lightweight pretty format for commit list / graph queries.
 * Omits the heavy commit body and diff to maintain high throughput.
 *
 * Fields:
 * 0: %H  - Commit SHA
 * 1: %h  - Abbreviated commit SHA
 * 2: %P  - Parent SHAs (space separated)
 * 3: %an - Author name
 * 4: %ae - Author email
 * 5: %at - Author timestamp (UNIX epoch seconds)
 * 6: %aI - Author date strict ISO 8601 (for timezone extraction)
 * 7: %cn - Committer name
 * 8: %ce - Committer email
 * 9: %ct - Committer timestamp (UNIX epoch seconds)
 * 10: %cI - Committer date strict ISO 8601 (for timezone extraction)
 * 11: %D - Decorations (branches, tags, HEAD)
 * 12: %s - Subject line
 */
export const METADATA_FORMAT =
  '%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%aI%x1f%cn%x1f%ce%x1f%ct%x1f%cI%x1f%D%x1f%s%x1e';

/**
 * Detailed pretty format for single commit inspection.
 * Includes field 13 (%b - Commit body).
 */
export const DETAILS_FORMAT =
  '%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%aI%x1f%cn%x1f%ce%x1f%ct%x1f%cI%x1f%D%x1f%s%x1f%b%x1e';

/**
 * Default known remote names used to identify remote tracking branches.
 */
export const DEFAULT_KNOWN_REMOTES = ['origin', 'upstream'];

/**
 * Extracts a timezone string (e.g., '+07:00' or 'Z') from an ISO date string or raw offset.
 */
export function extractTimezone(isoOrOffset: string): string {
  if (!isoOrOffset) {
    return 'Z';
  }
  const trimmed = isoOrOffset.trim();
  if (
    trimmed.endsWith('Z') ||
    trimmed === '+00:00' ||
    trimmed === '-00:00' ||
    trimmed === '+0000'
  ) {
    return 'Z';
  }
  // Matches strict ISO offset at end of string (+07:00, -05:00)
  const isoMatch = /([+-]\d{2}:\d{2})$/.exec(trimmed);
  if (isoMatch && isoMatch[1]) {
    return isoMatch[1];
  }
  // Matches git raw format offset (+0700, -0500)
  const rawMatch = /^([+-]\d{2})(\d{2})$/.exec(trimmed);
  if (rawMatch && rawMatch[1] && rawMatch[2]) {
    return `${rawMatch[1]}:${rawMatch[2]}`;
  }
  return trimmed;
}

/**
 * Parses git log's %D decoration string into structured GitRef objects.
 *
 * Examples of %D input:
 * - "HEAD -> main, origin/main, tag: v1.0.0"
 * - "HEAD" (detached)
 * - "tag: v2.0.0-rc1, feature/auth"
 */
export function parseDecorations(
  decorationStr: string,
  commitSha: CommitSha,
  knownRemotes: string[] = DEFAULT_KNOWN_REMOTES,
): GitRef[] {
  if (!decorationStr || !decorationStr.trim()) {
    return [];
  }

  const parts = decorationStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const refs: GitRef[] = [];
  const refMap = new Map<string, GitRef>();

  let headTargetBranch: string | undefined;

  // First pass: detect HEAD pointer e.g. "HEAD -> main"
  for (const part of parts) {
    if (part.startsWith('HEAD -> ')) {
      headTargetBranch = part.slice('HEAD -> '.length).trim();
      const headRef: GitRef = {
        name: 'HEAD',
        fullName: 'HEAD',
        target: commitSha,
        kind: 'head',
        isCurrent: true,
      };
      refMap.set(headRef.fullName, headRef);
      break;
    } else if (part === 'HEAD') {
      const headRef: GitRef = {
        name: 'HEAD',
        fullName: 'HEAD',
        target: commitSha,
        kind: 'head',
        isCurrent: true,
      };
      refMap.set(headRef.fullName, headRef);
      break;
    }
  }

  // Second pass: parse branches, tags, remotes
  for (const part of parts) {
    if (part === 'HEAD' || part.startsWith('HEAD -> ')) {
      continue;
    }

    if (part.startsWith('tag: ')) {
      let tagName = part.slice('tag: '.length).trim();
      if (tagName.includes(' -> ')) {
        const tagParts = tagName.split(' -> ');
        tagName = tagParts[0]?.trim() ?? tagName;
      }
      const tagRef: GitRef = {
        name: tagName,
        fullName: `refs/tags/${tagName}`,
        target: commitSha,
        kind: 'tag',
      };
      refMap.set(tagRef.fullName, tagRef);
      continue;
    }

    if (part.startsWith('refs/tags/')) {
      const tagName = part.slice('refs/tags/'.length).trim();
      const tagRef: GitRef = {
        name: tagName,
        fullName: part,
        target: commitSha,
        kind: 'tag',
      };
      refMap.set(tagRef.fullName, tagRef);
      continue;
    }

    // Remote branch check:
    // Starts with refs/remotes/ or matches a known remote prefix (e.g. 'origin/')
    const isExplicitRemote = part.startsWith('refs/remotes/');
    const cleanPart = isExplicitRemote ? part.slice('refs/remotes/'.length) : part;
    const isKnownRemote = knownRemotes.some(
      (r) => cleanPart === r || cleanPart.startsWith(`${r}/`),
    );

    if (isExplicitRemote || isKnownRemote) {
      const remoteRef: GitRef = {
        name: cleanPart,
        fullName: `refs/remotes/${cleanPart}`,
        target: commitSha,
        kind: 'remoteBranch',
      };
      refMap.set(remoteRef.fullName, remoteRef);
      continue;
    }

    // Otherwise treat as local branch
    const cleanLocal = part.startsWith('refs/heads/') ? part.slice('refs/heads/'.length) : part;
    const isCurrent = headTargetBranch === cleanLocal;
    const localRef: GitRef = {
      name: cleanLocal,
      fullName: `refs/heads/${cleanLocal}`,
      target: commitSha,
      kind: 'localBranch',
      isCurrent: isCurrent || undefined,
    };
    refMap.set(localRef.fullName, localRef);
  }

  // If HEAD was pointing to a branch that was not explicitly listed in %D
  if (headTargetBranch && !refMap.has(`refs/heads/${headTargetBranch}`)) {
    const currentBranchRef: GitRef = {
      name: headTargetBranch,
      fullName: `refs/heads/${headTargetBranch}`,
      target: commitSha,
      kind: 'localBranch',
      isCurrent: true,
    };
    refMap.set(currentBranchRef.fullName, currentBranchRef);
  }

  for (const ref of refMap.values()) {
    refs.push(ref);
  }

  return refs;
}

/**
 * Parser for git log formatted with control-character delimiters.
 */
export class CommitLogParser {
  public static readonly RECORD_SEPARATOR = RECORD_SEPARATOR;
  public static readonly FIELD_SEPARATOR = FIELD_SEPARATOR;
  public static readonly METADATA_FORMAT = METADATA_FORMAT;
  public static readonly DETAILS_FORMAT = DETAILS_FORMAT;

  /**
   * Parses raw stdout from `git log` containing multiple records.
   * Tolerates empty lines, trailing newlines, and gracefully ignores malformed/truncated records.
   */
  public static parseLog(output: string, knownRemotes?: string[]): Commit[] {
    if (!output || typeof output !== 'string') {
      return [];
    }

    const records = output.split(RECORD_SEPARATOR);
    const commits: Commit[] = [];

    for (const rawRecord of records) {
      // Skip empty or newline-only tokens between records
      const record = rawRecord.replace(/^[\r\n]+|[\r\n]+$/g, '');
      if (!record) {
        continue;
      }

      const commit = CommitLogParser.parseRecord(record, knownRemotes);
      if (commit) {
        commits.push(commit);
      }
    }

    return commits;
  }

  /**
   * Parses a single record string (split by FIELD_SEPARATOR).
   * Returns null if the record is malformed, truncated, or lacks required fields.
   */
  public static parseRecord(record: string, knownRemotes?: string[]): Commit | null {
    if (!record) {
      return null;
    }

    const fields = record.split(FIELD_SEPARATOR);
    // Minimum 13 fields required for METADATA_FORMAT
    if (fields.length < 13) {
      return null;
    }

    const sha = (fields[0] ?? '').trim();
    // Validate SHA (must be valid non-empty hex)
    if (!sha || !/^[0-9a-fA-F]{4,64}$/.test(sha)) {
      return null;
    }

    const shortSha = (fields[1] ?? '').trim() || sha.slice(0, 7);

    // Parse parents (empty string for root commits, space-separated for merges)
    const parentsStr = (fields[2] ?? '').trim();
    const parents: CommitSha[] = parentsStr ? parentsStr.split(/\s+/).filter(Boolean) : [];

    // Parse author identity
    const authorName = fields[3] ?? '';
    const authorEmail = fields[4] ?? '';
    const authorTimestampParsed = Number.parseInt(fields[5] ?? '0', 10);
    const authorTimestamp = Number.isNaN(authorTimestampParsed) ? 0 : authorTimestampParsed;
    const authorTimezone = extractTimezone(fields[6] ?? '');

    const author: GitIdentity = {
      name: authorName,
      email: authorEmail,
      timestamp: authorTimestamp,
      timezone: authorTimezone,
    };

    // Parse committer identity
    const committerName = fields[7] ?? '';
    const committerEmail = fields[8] ?? '';
    const committerTimestampParsed = Number.parseInt(fields[9] ?? '0', 10);
    const committerTimestamp = Number.isNaN(committerTimestampParsed)
      ? 0
      : committerTimestampParsed;
    const committerTimezone = extractTimezone(fields[10] ?? '');

    const committer: GitIdentity = {
      name: committerName,
      email: committerEmail,
      timestamp: committerTimestamp,
      timezone: committerTimezone,
    };

    // Parse decorations
    const decorationsStr = fields[11] ?? '';
    const refs = parseDecorations(decorationsStr, sha, knownRemotes);

    // Parse subject
    const subject = fields[12] ?? '';

    // Parse optional body (field index 13 and beyond)
    let body: string | undefined;
    if (fields.length > 13) {
      const rawBody = fields.slice(13).join(FIELD_SEPARATOR).trim();
      body = rawBody.length > 0 ? rawBody : undefined;
    }

    const commit: Commit = {
      sha,
      shortSha,
      parents,
      author,
      committer,
      subject,
      refs,
    };

    if (body !== undefined) {
      commit.body = body;
    }

    return commit;
  }
}
