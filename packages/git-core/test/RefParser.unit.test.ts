import { describe, expect, it } from 'vitest';
import { REF_FIELD_SEPARATOR, REF_RECORD_SEPARATOR, RefParser } from '../src/parsers/RefParser';

describe('RefParser', () => {
  const makeRecord = (
    fullName: string,
    objectname: string,
    objecttype: string,
    peeledTarget = '',
    upstream = '',
    headMarker = '',
    symref = '',
  ) => {
    return [fullName, objectname, objecttype, peeledTarget, upstream, headMarker, symref].join(
      REF_FIELD_SEPARATOR,
    );
  };

  it('parses local branch with upstream and current HEAD marker', () => {
    const record = makeRecord(
      'refs/heads/feature/login',
      '0123456789abcdef0123456789abcdef01234567',
      'commit',
      '',
      'origin/feature/login',
      '*',
    );
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'feature/login',
      fullName: 'refs/heads/feature/login',
      target: '0123456789abcdef0123456789abcdef01234567',
      kind: 'localBranch',
      isCurrent: true,
      upstream: 'origin/feature/login',
    });
  });

  it('parses non-current local branch without upstream', () => {
    const record = makeRecord(
      'refs/heads/main',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'commit',
      '',
      '',
      ' ',
    );
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'main',
      fullName: 'refs/heads/main',
      target: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      kind: 'localBranch',
      isCurrent: undefined,
      upstream: undefined,
    });
  });

  it('parses remote tracking branch', () => {
    const record = makeRecord(
      'refs/remotes/origin/main',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'commit',
    );
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'origin/main',
      fullName: 'refs/remotes/origin/main',
      target: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      kind: 'remoteBranch',
      isSymbolic: undefined,
      symrefTarget: undefined,
    });
  });

  it('parses remote symbolic HEAD', () => {
    const record = makeRecord(
      'refs/remotes/origin/HEAD',
      'cccccccccccccccccccccccccccccccccccccccc',
      'commit',
      '',
      '',
      '',
      'refs/remotes/origin/main',
    );
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'origin/HEAD',
      fullName: 'refs/remotes/origin/HEAD',
      target: 'cccccccccccccccccccccccccccccccccccccccc',
      kind: 'remoteBranch',
      isSymbolic: true,
      symrefTarget: 'refs/remotes/origin/main',
    });
  });

  it('parses annotated tag with peeled commit target and tagObjectSha', () => {
    const tagObjectSha = '1111111111111111111111111111111111111111';
    const commitSha = '2222222222222222222222222222222222222222';
    const record = makeRecord('refs/tags/v1.0.0', tagObjectSha, 'tag', commitSha);
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'v1.0.0',
      fullName: 'refs/tags/v1.0.0',
      target: commitSha,
      kind: 'tag',
      tagType: 'annotated',
      tagObjectSha,
    });
  });

  it('parses lightweight tag directly pointing to commit', () => {
    const commitSha = '3333333333333333333333333333333333333333';
    const record = makeRecord('refs/tags/v0.9-alpha', commitSha, 'commit', '');
    const ref = RefParser.parseRecord(record);

    expect(ref).not.toBeNull();
    expect(ref).toEqual({
      name: 'v0.9-alpha',
      fullName: 'refs/tags/v0.9-alpha',
      target: commitSha,
      kind: 'tag',
      tagType: 'lightweight',
      tagObjectSha: undefined,
    });
  });

  it('correctly filters interactive branches to exclude remote symbolic HEAD', () => {
    const records = [
      makeRecord('refs/heads/main', '1111', 'commit', '', '', '*'),
      makeRecord('refs/remotes/origin/main', '1111', 'commit'),
      makeRecord(
        'refs/remotes/origin/HEAD',
        '1111',
        'commit',
        '',
        '',
        '',
        'refs/remotes/origin/main',
      ),
      makeRecord('refs/tags/v1.0.0', '2222', 'commit'),
    ].join(REF_RECORD_SEPARATOR);

    const allRefs = RefParser.parseRefs(records);
    expect(allRefs).toHaveLength(4);

    const interactive = RefParser.filterInteractiveBranches(allRefs);
    expect(interactive).toHaveLength(3);
    expect(interactive.some((r) => r.name === 'origin/HEAD')).toBe(false);
  });

  it('normalizes ref names and kinds properly', () => {
    expect(RefParser.normalizeRefName('refs/heads/feat/awesome')).toEqual({
      displayName: 'feat/awesome',
      kind: 'localBranch',
    });
    expect(RefParser.normalizeRefName('refs/remotes/upstream/pr/42')).toEqual({
      displayName: 'upstream/pr/42',
      kind: 'remoteBranch',
    });
    expect(RefParser.normalizeRefName('refs/tags/release/2026.1')).toEqual({
      displayName: 'release/2026.1',
      kind: 'tag',
    });
    expect(RefParser.normalizeRefName('HEAD')).toEqual({
      displayName: 'HEAD',
      kind: 'head',
    });
  });

  it('handles Unicode ref names correctly', () => {
    const branchName = 'tính-năng-tiếng-việt';
    const tagName = 'phiên-bản-đầu-tiên';
    const records = [
      makeRecord(`refs/heads/${branchName}`, '1234', 'commit'),
      makeRecord(`refs/tags/${tagName}`, '5678', 'commit'),
    ].join(REF_RECORD_SEPARATOR);

    const refs = RefParser.parseRefs(records);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.name).toBe(branchName);
    expect(refs[1]?.name).toBe(tagName);
  });

  it('gracefully tolerates malformed and empty output', () => {
    expect(RefParser.parseRefs('')).toEqual([]);
    expect(RefParser.parseRefs('   \n\r\n  ')).toEqual([]);
    expect(RefParser.parseRecord('')).toBeNull();
    expect(RefParser.parseRecord('refs/heads/foo\x1f123')).toBeNull(); // fewer than 7 fields
  });
});
