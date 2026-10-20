import type { GitRef, GitRefKind, TagType } from '@git-graph/shared';

/**
 * Control characters used to reliably delimit records and fields in git for-each-ref output.
 * ASCII 0x1E: Record Separator (RS)
 * ASCII 0x1F: Unit/Field Separator (US)
 */
export const REF_RECORD_SEPARATOR = '\x1e';
export const REF_FIELD_SEPARATOR = '\x1f';

/**
 * Predetermined format for `git for-each-ref`.
 *
 * Fields:
 * 0: %(refname)          - Full ref name (e.g. refs/heads/main, refs/tags/v1.0.0)
 * 1: %(objectname)       - Direct SHA pointed to (tag object SHA for annotated tags, commit SHA otherwise)
 * 2: %(objecttype)       - Object type (commit, tag, etc.)
 * 3: %(*objectname)      - Peeled target SHA (dereferenced commit SHA for annotated tags)
 * 4: %(upstream:short)   - Short upstream tracking branch name
 * 5: %(HEAD)             - Current HEAD marker ('*' if checked out branch)
 * 6: %(symref)           - Symbolic ref target (e.g. refs/remotes/origin/main for origin/HEAD)
 */
export const REF_FORMAT =
  '%(refname)\x1f%(objectname)\x1f%(objecttype)\x1f%(*objectname)\x1f%(upstream:short)\x1f%(HEAD)\x1f%(symref)\x1e';

/**
 * Parser for `git for-each-ref` structured output.
 */
export class RefParser {
  public static readonly RECORD_SEPARATOR = REF_RECORD_SEPARATOR;
  public static readonly FIELD_SEPARATOR = REF_FIELD_SEPARATOR;
  public static readonly REF_FORMAT = REF_FORMAT;

  /**
   * Normalizes a full ref name into a human-friendly display name and identifies its kind.
   */
  public static normalizeRefName(fullName: string): { displayName: string; kind: GitRefKind } {
    if (fullName === 'HEAD' || fullName.startsWith('HEAD ')) {
      return { displayName: 'HEAD', kind: 'head' };
    }
    if (fullName.startsWith('refs/heads/')) {
      return {
        displayName: fullName.slice('refs/heads/'.length),
        kind: 'localBranch',
      };
    }
    if (fullName.startsWith('refs/remotes/')) {
      return {
        displayName: fullName.slice('refs/remotes/'.length),
        kind: 'remoteBranch',
      };
    }
    if (fullName.startsWith('refs/tags/')) {
      return {
        displayName: fullName.slice('refs/tags/'.length),
        kind: 'tag',
      };
    }
    return {
      displayName: fullName,
      kind: 'head',
    };
  }

  /**
   * Filters out symbolic remote HEAD refs (e.g. refs/remotes/origin/HEAD)
   * from the list of interactive branches.
   */
  public static filterInteractiveBranches(refs: GitRef[]): GitRef[] {
    return refs.filter(
      (ref) => !ref.isSymbolic && !ref.name.endsWith('/HEAD') && !ref.fullName.endsWith('/HEAD'),
    );
  }

  /**
   * Parses raw stdout from `git for-each-ref`.
   */
  public static parseRefs(output: string): GitRef[] {
    if (!output || typeof output !== 'string') {
      return [];
    }

    const records = output.split(REF_RECORD_SEPARATOR);
    const refs: GitRef[] = [];

    for (const rawRecord of records) {
      const record = rawRecord.replace(/^[\r\n]+|[\r\n]+$/g, '');
      if (!record) {
        continue;
      }

      const parsedRef = RefParser.parseRecord(record);
      if (parsedRef) {
        refs.push(parsedRef);
      }
    }

    return refs;
  }

  /**
   * Parses a single record delimited by FIELD_SEPARATOR.
   */
  public static parseRecord(record: string): GitRef | null {
    if (!record) {
      return null;
    }

    const fields = record.split(REF_FIELD_SEPARATOR);
    if (fields.length < 7) {
      return null;
    }

    const fullName = (fields[0] ?? '').trim();
    const objectname = (fields[1] ?? '').trim();
    const objecttype = (fields[2] ?? '').trim();
    const peeledTarget = (fields[3] ?? '').trim();
    const upstreamRaw = (fields[4] ?? '').trim();
    const headMarker = (fields[5] ?? '').trim();
    const symref = (fields[6] ?? '').trim();

    if (!fullName || !objectname) {
      return null;
    }

    // Local branches: refs/heads/*
    if (fullName.startsWith('refs/heads/')) {
      const name = fullName.slice('refs/heads/'.length);
      const isCurrent = headMarker === '*';
      const ref: GitRef = {
        name,
        fullName,
        target: objectname,
        kind: 'localBranch',
        isCurrent: isCurrent || undefined,
        upstream: upstreamRaw || undefined,
      };
      return ref;
    }

    // Remote branches: refs/remotes/*
    if (fullName.startsWith('refs/remotes/')) {
      const name = fullName.slice('refs/remotes/'.length);
      const isSymbolic = Boolean(symref || name.endsWith('/HEAD') || fullName.endsWith('/HEAD'));
      const ref: GitRef = {
        name,
        fullName,
        target: objectname,
        kind: 'remoteBranch',
        isSymbolic: isSymbolic || undefined,
        symrefTarget: symref || undefined,
      };
      return ref;
    }

    // Tags: refs/tags/*
    if (fullName.startsWith('refs/tags/')) {
      const name = fullName.slice('refs/tags/'.length);
      const isAnnotated = objecttype === 'tag' || peeledTarget.length > 0;
      const tagType: TagType = isAnnotated ? 'annotated' : 'lightweight';
      const target = isAnnotated && peeledTarget.length > 0 ? peeledTarget : objectname;

      const ref: GitRef = {
        name,
        fullName,
        target,
        kind: 'tag',
        tagType,
        tagObjectSha: isAnnotated ? objectname : undefined,
      };
      return ref;
    }

    // HEAD ref if explicitly encountered
    if (fullName === 'HEAD') {
      const ref: GitRef = {
        name: 'HEAD',
        fullName: 'HEAD',
        target: objectname,
        kind: 'head',
        isCurrent: true,
      };
      return ref;
    }

    return null;
  }
}
