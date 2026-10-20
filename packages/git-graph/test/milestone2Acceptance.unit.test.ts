import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Commit } from '@git-graph/shared';
import { buildCommitGraph, assertDeterministicOutput, assertInputNotMutated } from '../src/index';

function makeSyntheticCommit(sha: string, parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    subject: `Commit ${sha}`,
    refs: [],
  };
}

describe('Milestone 2 Acceptance Criteria', () => {
  it('Criterion 1: buildCommitGraph(commits, continuation?) is a pure function', () => {
    const commits = [
      makeSyntheticCommit('c3', ['c2', 'b1']),
      makeSyntheticCommit('b1', ['c1']),
      makeSyntheticCommit('c2', ['c1']),
      makeSyntheticCommit('c1', ['c0']),
      makeSyntheticCommit('c0', []),
    ];

    // Verify determinism across repeated calls
    assertDeterministicOutput(buildCommitGraph, commits);

    // Deep-clone and test for any input mutation
    const clone = JSON.parse(JSON.stringify(commits)) as Commit[];
    buildCommitGraph(commits);
    assertInputNotMutated(clone, commits);

    // Deep freeze input commits and run buildCommitGraph to ensure it does not throw or mutate
    const frozenCommits = Object.freeze(
      commits.map((c) =>
        Object.freeze({
          ...c,
          parents: Object.freeze([...c.parents]),
          refs: Object.freeze([...c.refs]),
        }),
      ),
    ) as ReadonlyArray<Commit>;

    expect(() => buildCommitGraph(frozenCommits)).not.toThrow();
  });

  it('Criterion 2: Package has zero dependencies on vscode, React, DOM or Git CLI', () => {
    // 1. Check package.json dependencies
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const allDeps = {
      ...(pkgContent.dependencies || {}),
      ...(pkgContent.peerDependencies || {}),
    };

    const forbiddenDeps = ['vscode', '@types/vscode', 'react', 'react-dom', '@types/react'];
    for (const forbidden of forbiddenDeps) {
      expect(allDeps[forbidden], `Package should not depend on ${forbidden}`).toBeUndefined();
    }

    // 2. Check source files under src/
    const srcDir = path.resolve(__dirname, '../src');
    function getSourceFiles(dir: string): string[] {
      const files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getSourceFiles(fullPath));
        } else if (entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const srcFiles = getSourceFiles(srcDir);
    expect(srcFiles.length).toBeGreaterThan(0);

    const forbiddenImports = ['vscode', 'react', 'child_process', 'node:child_process'];
    const forbiddenGlobals = ['window', 'document', 'HTMLElement'];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(srcDir, file);

      for (const imp of forbiddenImports) {
        const importRegex = new RegExp(`from\\s+['"]${imp}['"]`, 'g');
        expect(
          importRegex.test(content),
          `File ${relPath} must not import from forbidden package '${imp}'`,
        ).toBe(false);
      }

      for (const glob of forbiddenGlobals) {
        // Match word boundaries for DOM globals
        const globalRegex = new RegExp(`\\b${glob}\\b`, 'g');
        expect(
          globalRegex.test(content),
          `File ${relPath} must not reference DOM global '${glob}'`,
        ).toBe(false);
      }
    }
  });

  it('Criterion 3: Benchmark 10,000 synthetic commits completes well within 300ms budget', () => {
    const count = 10_000;
    const commits: Commit[] = [];

    for (let i = 0; i < count; i++) {
      const sha = `sha_${i}`;
      let parents: string[] = [];

      if (i < count - 1) {
        if (i % 25 === 0 && i < count - 2) {
          // Merge commit with 2 parents
          parents = [`sha_${i + 1}`, `sha_${i + 2}`];
        } else {
          // Linear parent
          parents = [`sha_${i + 1}`];
        }
      }

      commits.push(makeSyntheticCommit(sha, parents));
    }

    const start = performance.now();
    const result = buildCommitGraph(commits);
    const duration = performance.now() - start;

    expect(result).toHaveLength(count);
    expect(duration).toBeLessThan(300); // 300ms performance budget
  });
});
