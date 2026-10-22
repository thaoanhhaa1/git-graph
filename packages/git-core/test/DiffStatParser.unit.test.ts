import { describe, it, expect } from 'vitest';
import { DiffStatParser } from '../src/parsers/DiffStatParser';

describe('DiffStatParser', () => {
  describe('unquotePath', () => {
    it('unquotes double-quoted paths', () => {
      expect(DiffStatParser.unquotePath('"hello/world.txt"')).toBe('hello/world.txt');
      expect(DiffStatParser.unquotePath('"path with spaces/file.ts"')).toBe(
        'path with spaces/file.ts',
      );
    });

    it('returns unquoted string unchanged', () => {
      expect(DiffStatParser.unquotePath('src/index.ts')).toBe('src/index.ts');
    });
  });

  describe('parseRenamePath', () => {
    it('parses standard curly brace rename', () => {
      const res = DiffStatParser.parseRenamePath('src/{old => new}/file.ts');
      expect(res.oldPath).toBe('src/old/file.ts');
      expect(res.newPath).toBe('src/new/file.ts');
    });

    it('parses root level curly brace rename', () => {
      const res = DiffStatParser.parseRenamePath('{old => new}/file.ts');
      expect(res.oldPath).toBe('old/file.ts');
      expect(res.newPath).toBe('new/file.ts');
    });

    it('parses directory movement', () => {
      const res = DiffStatParser.parseRenamePath('{ => src}/main.ts');
      expect(res.oldPath).toBe('main.ts');
      expect(res.newPath).toBe('src/main.ts');
    });

    it('parses direct arrow rename without braces', () => {
      const res = DiffStatParser.parseRenamePath('old.ts => new.ts');
      expect(res.oldPath).toBe('old.ts');
      expect(res.newPath).toBe('new.ts');
    });

    it('returns non-renamed paths as newPath with undefined oldPath', () => {
      const res = DiffStatParser.parseRenamePath('packages/git-core/src/index.ts');
      expect(res.oldPath).toBeUndefined();
      expect(res.newPath).toBe('packages/git-core/src/index.ts');
    });
  });

  describe('parseNumstat', () => {
    it('parses standard additions and deletions', () => {
      const raw = `10\t5\tsrc/index.ts\n0\t20\tdocs/readme.md`;
      const result = DiffStatParser.parseNumstat(raw);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'src/index.ts',
        oldPath: undefined,
        additions: 10,
        deletions: 5,
        isBinary: false,
      });
      expect(result[1]).toEqual({
        path: 'docs/readme.md',
        oldPath: undefined,
        additions: 0,
        deletions: 20,
        isBinary: false,
      });
    });

    it('detects binary files represented by -\\t-', () => {
      const raw = `-\t-\timages/logo.png\n-\t-\tassets/font.woff2`;
      const result = DiffStatParser.parseNumstat(raw);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'images/logo.png',
        oldPath: undefined,
        additions: undefined,
        deletions: undefined,
        isBinary: true,
      });
    });

    it('parses renamed files in numstat', () => {
      const raw = `15\t3\tsrc/{oldDir => newDir}/app.ts`;
      const result = DiffStatParser.parseNumstat(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/newDir/app.ts',
        oldPath: 'src/oldDir/app.ts',
        additions: 15,
        deletions: 3,
        isBinary: false,
      });
    });

    it('handles empty or malformed input gracefully', () => {
      expect(DiffStatParser.parseNumstat('')).toEqual([]);
      expect(DiffStatParser.parseNumstat('   \n\n  ')).toEqual([]);
      expect(DiffStatParser.parseNumstat('malformed line')).toEqual([]);
    });
  });

  describe('parseNameStatus', () => {
    it('parses standard A, M, D status codes', () => {
      const raw = `A\tsrc/new.ts\nM\tsrc/existing.ts\nD\tsrc/deleted.ts`;
      const result = DiffStatParser.parseNameStatus(raw);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        path: 'src/new.ts',
        oldPath: undefined,
        status: 'added',
        similarity: undefined,
      });
      expect(result[1]).toEqual({
        path: 'src/existing.ts',
        oldPath: undefined,
        status: 'modified',
        similarity: undefined,
      });
      expect(result[2]).toEqual({
        path: 'src/deleted.ts',
        oldPath: undefined,
        status: 'deleted',
        similarity: undefined,
      });
    });

    it('parses rename with similarity percentage (e.g. R100, R085)', () => {
      const raw = `R100\told/path.ts\tnew/path.ts\nR085\told2.ts\tnew2.ts`;
      const result = DiffStatParser.parseNameStatus(raw);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'new/path.ts',
        oldPath: 'old/path.ts',
        status: 'renamed',
        similarity: 100,
      });
      expect(result[1]).toEqual({
        path: 'new2.ts',
        oldPath: 'old2.ts',
        status: 'renamed',
        similarity: 85,
      });
    });

    it('parses copy with similarity percentage (e.g. C090)', () => {
      const raw = `C090\tsrc/template.ts\tsrc/copy.ts`;
      const result = DiffStatParser.parseNameStatus(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/copy.ts',
        oldPath: 'src/template.ts',
        status: 'copied',
        similarity: 90,
      });
    });

    it('parses typeChanged (T) and unmerged (U)', () => {
      const raw = `T\tsymlink_file\nU\tconflict.ts`;
      const result = DiffStatParser.parseNameStatus(raw);

      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe('typeChanged');
      expect(result[1]!.status).toBe('unmerged');
    });
  });

  describe('combine', () => {
    it('correctly merges numstat and name-status entries', () => {
      const numstatRaw = `10\t2\tsrc/index.ts\n-\t-\tlogo.png\n5\t1\tnew/file.ts`;
      const nameStatusRaw = `M\tsrc/index.ts\nA\tlogo.png\nR100\told/file.ts\tnew/file.ts`;

      const numstats = DiffStatParser.parseNumstat(numstatRaw);
      const nameStatuses = DiffStatParser.parseNameStatus(nameStatusRaw);

      const combined = DiffStatParser.combine(numstats, nameStatuses);

      expect(combined).toHaveLength(3);

      expect(combined[0]).toEqual({
        path: 'src/index.ts',
        oldPath: undefined,
        status: 'modified',
        additions: 10,
        deletions: 2,
        isBinary: false,
        similarity: undefined,
      });

      expect(combined[1]).toEqual({
        path: 'logo.png',
        oldPath: undefined,
        status: 'added',
        additions: undefined,
        deletions: undefined,
        isBinary: true,
        similarity: undefined,
      });

      expect(combined[2]).toEqual({
        path: 'new/file.ts',
        oldPath: 'old/file.ts',
        status: 'renamed',
        additions: 5,
        deletions: 1,
        isBinary: false,
        similarity: 100,
      });
    });

    it('includes zero-diff added or deleted files that only exist in name-status', () => {
      const numstats = DiffStatParser.parseNumstat('');
      const nameStatuses = DiffStatParser.parseNameStatus('A\tempty_file.txt');

      const combined = DiffStatParser.combine(numstats, nameStatuses);
      expect(combined).toHaveLength(1);
      expect(combined[0]).toEqual({
        path: 'empty_file.txt',
        oldPath: undefined,
        status: 'added',
        additions: 0,
        deletions: 0,
        isBinary: false,
        similarity: undefined,
      });
    });
  });

  describe('parseNumstatWithSummary', () => {
    it('parses mixed numstat and summary output', () => {
      const raw = `10\t0\tsrc/new.ts
-\t-\tassets/image.png
5\t2\tsrc/edit.ts
0\t15\told_file.txt
create mode 100644 src/new.ts
create mode 100644 assets/image.png
delete mode 100644 old_file.txt`;

      const changes = DiffStatParser.parseNumstatWithSummary(raw);

      expect(changes).toHaveLength(4);

      const newFile = changes.find((c) => c.path === 'src/new.ts');
      expect(newFile).toBeDefined();
      expect(newFile!.status).toBe('added');
      expect(newFile!.additions).toBe(10);
      expect(newFile!.deletions).toBe(0);

      const imageFile = changes.find((c) => c.path === 'assets/image.png');
      expect(imageFile).toBeDefined();
      expect(imageFile!.status).toBe('added');
      expect(imageFile!.isBinary).toBe(true);

      const editFile = changes.find((c) => c.path === 'src/edit.ts');
      expect(editFile).toBeDefined();
      expect(editFile!.status).toBe('modified');

      const delFile = changes.find((c) => c.path === 'old_file.txt');
      expect(delFile).toBeDefined();
      expect(delFile!.status).toBe('deleted');
      expect(delFile!.deletions).toBe(15);
    });

    it('parses summary renames with similarity percentage', () => {
      const raw = `2\t2\tdst/app.ts
rename src/app.ts => dst/app.ts (92%)`;

      const changes = DiffStatParser.parseNumstatWithSummary(raw);
      expect(changes).toHaveLength(1);
      expect(changes[0]!).toEqual({
        path: 'dst/app.ts',
        oldPath: 'src/app.ts',
        status: 'renamed',
        additions: 2,
        deletions: 2,
        isBinary: false,
        similarity: 92,
      });
    });
  });

  describe('parseRawDiff', () => {
    it('parses modified, added, deleted, and renamed entries', () => {
      const raw = [
        ':100644 100644 aaaaaaa bbbbbbb M\tsrc/app.ts',
        ':000000 100644 0000000 ccccccc A\tdocs/new.md',
        ':100644 000000 ddddddd 0000000 D\tlegacy.txt',
        ':100644 100644 eeeeeee fffffff R100\told/name.ts\tnew/name.ts',
      ].join('\n');

      const entries = DiffStatParser.parseRawDiff(raw);

      expect(entries).toHaveLength(4);
      expect(entries[0]).toMatchObject({ path: 'src/app.ts', status: 'modified' });
      expect(entries[1]).toMatchObject({ path: 'docs/new.md', status: 'added' });
      expect(entries[2]).toMatchObject({ path: 'legacy.txt', status: 'deleted' });
      expect(entries[3]).toMatchObject({
        path: 'new/name.ts',
        oldPath: 'old/name.ts',
        status: 'renamed',
        similarity: 100,
      });
    });

    it('marks submodule changes when either mode is 160000', () => {
      const raw = [
        ':160000 160000 aaaaaaa bbbbbbb M\tvendor/lib',
        ':100644 160000 ccccccc ddddddd M\tlibs/now-submodule',
        ':160000 100644 eeeeeee fffffff M\tlibs/now-file',
      ].join('\n');

      const entries = DiffStatParser.parseRawDiff(raw);

      expect(entries).toHaveLength(3);
      expect(entries.every((entry) => entry.isSubmodule)).toBe(true);
    });

    it('ignores non-raw lines', () => {
      expect(DiffStatParser.parseRawDiff('M\tsrc/app.ts\n')).toEqual([]);
      expect(DiffStatParser.parseRawDiff('')).toEqual([]);
    });
  });

  describe('computeStats', () => {
    it('sums additions, deletions and counts filesChanged ignoring binary lines', () => {
      const changes = [
        { path: 'a.ts', status: 'modified' as const, additions: 10, deletions: 2, isBinary: false },
        { path: 'b.ts', status: 'added' as const, additions: 25, deletions: 0, isBinary: false },
        { path: 'c.png', status: 'added' as const, isBinary: true },
      ];

      const stats = DiffStatParser.computeStats(changes);
      expect(stats).toEqual({
        filesChanged: 3,
        additions: 35,
        deletions: 2,
      });
    });
  });
});
