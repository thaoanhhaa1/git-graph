import { describe, it, expect } from 'vitest';
import { GitRefSchema, GitRefKindSchema, TagTypeSchema } from '@git-graph/shared';
import { RefParser } from '../src/parsers/RefParser';

describe('RefValidation & RefParser - Unit Tests', () => {
  describe('GitRefSchema validation', () => {
    it('accepts valid local branch ref', () => {
      const validLocal = {
        name: 'feature/login-v2',
        fullName: 'refs/heads/feature/login-v2',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'localBranch' as const,
        isCurrent: true,
        upstream: 'origin/feature/login-v2',
      };
      const parsed = GitRefSchema.safeParse(validLocal);
      expect(parsed.success).toBe(true);
    });

    it('accepts valid remote tracking branch ref with symbolic target', () => {
      const validRemote = {
        name: 'origin/HEAD',
        fullName: 'refs/remotes/origin/HEAD',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'remoteBranch' as const,
        isSymbolic: true,
        symrefTarget: 'refs/remotes/origin/main',
      };
      const parsed = GitRefSchema.safeParse(validRemote);
      expect(parsed.success).toBe(true);
    });

    it('accepts lightweight and annotated tags', () => {
      const lightweight = {
        name: 'v1.0.0',
        fullName: 'refs/tags/v1.0.0',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'tag' as const,
        tagType: 'lightweight' as const,
      };
      const annotated = {
        name: 'v2.0.0',
        fullName: 'refs/tags/v2.0.0',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'tag' as const,
        tagType: 'annotated' as const,
        tagObjectSha: 'abcdef1234567890abcdef1234567890abcdef12',
      };
      expect(GitRefSchema.safeParse(lightweight).success).toBe(true);
      expect(GitRefSchema.safeParse(annotated).success).toBe(true);
    });

    it('rejects ref with empty name or fullName', () => {
      const emptyName = {
        name: '',
        fullName: 'refs/heads/main',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'localBranch' as const,
      };
      const emptyFullName = {
        name: 'main',
        fullName: '',
        target: '1234567890abcdef1234567890abcdef12345678',
        kind: 'localBranch' as const,
      };
      expect(GitRefSchema.safeParse(emptyName).success).toBe(false);
      expect(GitRefSchema.safeParse(emptyFullName).success).toBe(false);
    });

    it('rejects ref with invalid SHA format', () => {
      const invalidSha = {
        name: 'main',
        fullName: 'refs/heads/main',
        target: '',
        kind: 'localBranch' as const,
      };
      expect(GitRefSchema.safeParse(invalidSha).success).toBe(false);
    });

    it('validates GitRefKind and TagType enums strictly', () => {
      expect(GitRefKindSchema.safeParse('head').success).toBe(true);
      expect(GitRefKindSchema.safeParse('localBranch').success).toBe(true);
      expect(GitRefKindSchema.safeParse('remoteBranch').success).toBe(true);
      expect(GitRefKindSchema.safeParse('tag').success).toBe(true);
      expect(GitRefKindSchema.safeParse('stash').success).toBe(false);

      expect(TagTypeSchema.safeParse('lightweight').success).toBe(true);
      expect(TagTypeSchema.safeParse('annotated').success).toBe(true);
      expect(TagTypeSchema.safeParse('signed').success).toBe(false);
    });
  });

  describe('RefParser.parseRecord validation', () => {
    it('parses valid 7-field for-each-ref record', () => {
      const record = [
        'refs/heads/main',
        '1234567890abcdef1234567890abcdef12345678',
        'commit',
        '',
        'origin/main',
        '*',
        '',
      ].join(RefParser.FIELD_SEPARATOR);

      const ref = RefParser.parseRecord(record);
      expect(ref).toBeDefined();
      expect(ref?.name).toBe('main');
      expect(ref?.fullName).toBe('refs/heads/main');
      expect(ref?.kind).toBe('localBranch');
      expect(ref?.isCurrent).toBe(true);
      expect(ref?.upstream).toBe('origin/main');
    });

    it('returns null for empty records and records with fewer than 7 fields', () => {
      expect(RefParser.parseRecord('')).toBeNull();
      expect(RefParser.parseRecord('refs/heads/main\x1Fmain')).toBeNull();
    });

    it('ignores non-standard ref namespaces like refs/notes/ or refs/stash', () => {
      const record = [
        'refs/notes/commits',
        '1234567890abcdef1234567890abcdef12345678',
        'commit',
        '',
        '',
        '',
        '',
      ].join(RefParser.FIELD_SEPARATOR);

      expect(RefParser.parseRecord(record)).toBeNull();
    });
  });
});
