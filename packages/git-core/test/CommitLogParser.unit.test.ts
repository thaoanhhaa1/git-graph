import { describe, expect, it } from 'vitest';
import { CommitSchema } from '@git-graph/shared';
import {
  CommitLogParser,
  extractTimezone,
  parseDecorations,
  RECORD_SEPARATOR,
  FIELD_SEPARATOR,
} from '../src/parsers/CommitLogParser';

describe('CommitLogParser - Unit Tests', () => {
  describe('extractTimezone', () => {
    it('extracts strict ISO 8601 offset correctly', () => {
      expect(extractTimezone('2026-09-18T18:53:58+07:00')).toBe('+07:00');
      expect(extractTimezone('2026-09-18T11:53:58-05:00')).toBe('-05:00');
      expect(extractTimezone('2026-09-18T11:53:58Z')).toBe('Z');
      expect(extractTimezone('+0700')).toBe('+07:00');
      expect(extractTimezone('-0400')).toBe('-04:00');
      expect(extractTimezone('Z')).toBe('Z');
      expect(extractTimezone('')).toBe('Z');
    });
  });

  describe('parseDecorations', () => {
    const targetSha = 'a'.repeat(40);

    it('returns empty array for empty decoration string', () => {
      expect(parseDecorations('', targetSha)).toEqual([]);
      expect(parseDecorations('   ', targetSha)).toEqual([]);
    });

    it('parses HEAD pointing to local branch (HEAD -> main)', () => {
      const refs = parseDecorations('HEAD -> main', targetSha);
      expect(refs).toHaveLength(2);

      const headRef = refs.find((r) => r.name === 'HEAD');
      expect(headRef).toBeDefined();
      expect(headRef?.kind).toBe('head');
      expect(headRef?.isCurrent).toBe(true);

      const mainRef = refs.find((r) => r.name === 'main');
      expect(mainRef).toBeDefined();
      expect(mainRef?.fullName).toBe('refs/heads/main');
      expect(mainRef?.kind).toBe('localBranch');
      expect(mainRef?.isCurrent).toBe(true);
    });

    it('parses detached HEAD', () => {
      const refs = parseDecorations('HEAD', targetSha);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        name: 'HEAD',
        fullName: 'HEAD',
        target: targetSha,
        kind: 'head',
        isCurrent: true,
      });
    });

    it('parses tags and remote branches', () => {
      const decorationStr = 'HEAD -> main, origin/main, origin/HEAD, tag: v1.0.0, tag: v1.0.1';
      const refs = parseDecorations(decorationStr, targetSha, ['origin']);

      const tag1 = refs.find((r) => r.name === 'v1.0.0');
      expect(tag1).toBeDefined();
      expect(tag1?.kind).toBe('tag');
      expect(tag1?.fullName).toBe('refs/tags/v1.0.0');

      const tag2 = refs.find((r) => r.name === 'v1.0.1');
      expect(tag2).toBeDefined();
      expect(tag2?.kind).toBe('tag');

      const remoteMain = refs.find((r) => r.name === 'origin/main');
      expect(remoteMain).toBeDefined();
      expect(remoteMain?.kind).toBe('remoteBranch');
      expect(remoteMain?.fullName).toBe('refs/remotes/origin/main');
    });

    it('parses custom remote and feature branches', () => {
      const decorationStr = 'upstream/feature/sync, feature/auth';
      const refs = parseDecorations(decorationStr, targetSha, ['origin', 'upstream']);

      const remoteBranch = refs.find((r) => r.name === 'upstream/feature/sync');
      expect(remoteBranch?.kind).toBe('remoteBranch');

      const localBranch = refs.find((r) => r.name === 'feature/auth');
      expect(localBranch?.kind).toBe('localBranch');
    });
  });

  describe('parseRecord and parseLog', () => {
    function buildRecord(fields: {
      sha?: string;
      shortSha?: string;
      parents?: string;
      authorName?: string;
      authorEmail?: string;
      authorTimestamp?: number;
      authorDateIso?: string;
      committerName?: string;
      committerEmail?: string;
      committerTimestamp?: number;
      committerDateIso?: string;
      decorations?: string;
      subject?: string;
      body?: string;
    }): string {
      const arr = [
        fields.sha ?? '1111111111111111111111111111111111111111',
        fields.shortSha ?? '1111111',
        fields.parents ?? '',
        fields.authorName ?? 'Alice',
        fields.authorEmail ?? 'alice@example.com',
        String(fields.authorTimestamp ?? 1710000000),
        fields.authorDateIso ?? '2024-03-09T18:40:00+00:00',
        fields.committerName ?? 'Alice',
        fields.committerEmail ?? 'alice@example.com',
        String(fields.committerTimestamp ?? 1710000000),
        fields.committerDateIso ?? '2024-03-09T18:40:00+00:00',
        fields.decorations ?? '',
        fields.subject ?? 'Initial commit',
      ];
      if (fields.body !== undefined) {
        arr.push(fields.body);
      }
      return arr.join(FIELD_SEPARATOR);
    }

    it('parses a root commit with zero parents', () => {
      const record = buildRecord({
        sha: '2222222222222222222222222222222222222222',
        shortSha: '2222222',
        parents: '',
        subject: 'Root commit',
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit).not.toBeNull();
      expect(commit?.parents).toEqual([]);
      expect(commit?.sha).toBe('2222222222222222222222222222222222222222');
      expect(commit?.subject).toBe('Root commit');

      // Validates schema
      expect(() => CommitSchema.parse(commit)).not.toThrow();
    });

    it('parses a merge commit with 2 parents', () => {
      const parent1 = '3333333333333333333333333333333333333333';
      const parent2 = '4444444444444444444444444444444444444444';
      const record = buildRecord({
        sha: '5555555555555555555555555555555555555555',
        shortSha: '5555555',
        parents: `${parent1} ${parent2}`,
        subject: "Merge branch 'feature' into main",
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit).not.toBeNull();
      expect(commit?.parents).toEqual([parent1, parent2]);
      expect(() => CommitSchema.parse(commit)).not.toThrow();
    });

    it('parses an octopus merge commit with 3+ parents', () => {
      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);
      const record = buildRecord({
        parents: `${p1} ${p2} ${p3}`,
        subject: 'Octopus merge of 3 branches',
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit?.parents).toEqual([p1, p2, p3]);
    });

    it('parses commits with Unicode characters (Vietnamese, CJK, Emoji)', () => {
      const record = buildRecord({
        authorName: 'Hà Thao Anh',
        committerName: '山田 太郎',
        subject: '🚀 Tính năng: Hỗ trợ đồ thị Git trực quan (日本語 / Tiếng Việt)',
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit).not.toBeNull();
      expect(commit?.author.name).toBe('Hà Thao Anh');
      expect(commit?.committer.name).toBe('山田 太郎');
      expect(commit?.subject).toBe(
        '🚀 Tính năng: Hỗ trợ đồ thị Git trực quan (日本語 / Tiếng Việt)',
      );
      expect(() => CommitSchema.parse(commit)).not.toThrow();
    });

    it('parses commits with empty author or committer email', () => {
      const record = buildRecord({
        authorEmail: '',
        committerEmail: '',
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit).not.toBeNull();
      expect(commit?.author.email).toBe('');
      expect(commit?.committer.email).toBe('');
      expect(() => CommitSchema.parse(commit)).not.toThrow();
    });

    it('parses multiline commit body', () => {
      const multilineBody =
        'Detailed description line 1.\n\n- Bullet item A\n- Bullet item B\n\nCloses #123';
      const record = buildRecord({
        subject: 'Feat: Add commit query parser',
        body: multilineBody,
      });

      const commit = CommitLogParser.parseRecord(record);
      expect(commit).not.toBeNull();
      expect(commit?.subject).toBe('Feat: Add commit query parser');
      expect(commit?.body).toBe(multilineBody);
      expect(() => CommitSchema.parse(commit)).not.toThrow();
    });

    it('parses full log stream with multiple commits and control characters', () => {
      const rec1 = buildRecord({
        sha: '1'.repeat(40),
        shortSha: '1111111',
        subject: 'Commit 1',
      });
      const rec2 = buildRecord({
        sha: '2'.repeat(40),
        shortSha: '2222222',
        subject: 'Commit 2',
      });

      const logOutput = `${RECORD_SEPARATOR}${rec1}${RECORD_SEPARATOR}\n${RECORD_SEPARATOR}${rec2}${RECORD_SEPARATOR}`;
      const commits = CommitLogParser.parseLog(logOutput);

      expect(commits).toHaveLength(2);
      expect(commits[0]?.sha).toBe('1'.repeat(40));
      expect(commits[1]?.sha).toBe('2'.repeat(40));
    });
  });

  describe('Robustness and Fixtures for malformed/truncated output', () => {
    it('handles empty, whitespace, and newline strings gracefully', () => {
      expect(CommitLogParser.parseLog('')).toEqual([]);
      expect(CommitLogParser.parseLog('   \n\n  \r\n')).toEqual([]);
      expect(CommitLogParser.parseRecord('')).toBeNull();
    });

    it('ignores records with fewer than required fields', () => {
      const incompleteRecord = `1111111111111111111111111111111111111111${FIELD_SEPARATOR}1111111${FIELD_SEPARATOR}parent`;
      expect(CommitLogParser.parseRecord(incompleteRecord)).toBeNull();
    });

    it('ignores records with invalid non-hex SHAs', () => {
      const invalidShaRecord = [
        'not-a-valid-sha-xyz',
        'short',
        '',
        'Author',
        'author@test.com',
        '1710000000',
        '+00:00',
        'Committer',
        'committer@test.com',
        '1710000000',
        '+00:00',
        '',
        'Subject',
      ].join(FIELD_SEPARATOR);

      expect(CommitLogParser.parseRecord(invalidShaRecord)).toBeNull();
    });

    it('recovers valid commits when the stream is truncated mid-record (fixture test)', () => {
      const validRec = [
        '1'.repeat(40),
        '1111111',
        '',
        'Author',
        'author@test.com',
        '1710000000',
        '+00:00',
        'Committer',
        'committer@test.com',
        '1710000000',
        '+00:00',
        'HEAD -> main',
        'Valid first commit',
      ].join(FIELD_SEPARATOR);

      // Truncated trailing record (stream cut off in the middle of author name)
      const truncatedRec = `2222222222222222222222222222222222222222${FIELD_SEPARATOR}2222222${FIELD_SEPARATOR}${FIELD_SEPARATOR}Incomplete Au`;

      const fixtureStream = `${RECORD_SEPARATOR}${validRec}${RECORD_SEPARATOR}\n${RECORD_SEPARATOR}${truncatedRec}`;

      const commits = CommitLogParser.parseLog(fixtureStream);
      // Valid commit is parsed, truncated record is safely skipped without throwing
      expect(commits).toHaveLength(1);
      expect(commits[0]?.sha).toBe('1'.repeat(40));
      expect(commits[0]?.subject).toBe('Valid first commit');
    });

    it('handles garbage binary/control character noise without throwing', () => {
      const noise = '\x00\x01\x02random_garbage\xff\xfe\x1e\x1f\x1f\x1f';
      expect(() => CommitLogParser.parseLog(noise)).not.toThrow();
      expect(CommitLogParser.parseLog(noise)).toEqual([]);
    });

    it('safely falls back when timestamp is not a number', () => {
      const rec = [
        '3'.repeat(40),
        '3333333',
        '',
        'Author',
        'a@a.com',
        'not-a-number',
        '+00:00',
        'Committer',
        'c@c.com',
        'invalid-ts',
        '+00:00',
        '',
        'Fallback timestamp test',
      ].join(FIELD_SEPARATOR);

      const commit = CommitLogParser.parseRecord(rec);
      expect(commit).not.toBeNull();
      expect(commit?.author.timestamp).toBe(0);
      expect(commit?.committer.timestamp).toBe(0);
    });
  });
});
