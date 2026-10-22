import { describe, expect, it } from 'vitest';
import type { BlameLineInfo } from '@git-graph/shared';
import {
  DEFAULT_BLAME_FORMAT,
  buildBlameHover,
  buildRevealCommitCommandUri,
  formatBlameAnnotation,
  formatRelativeTime,
  isUncommittedBlameInfo,
} from '../../src/blame/BlameFormatter';

const NOW = 1_700_000_000_000;

function createLine(overrides: Partial<BlameLineInfo> = {}): BlameLineInfo {
  return {
    sha: 'abcdef1234567890abcdef1234567890abcdef12',
    shortSha: 'abcdef1',
    author: 'Alice',
    authorEmail: 'alice@example.com',
    timestamp: NOW / 1000 - 120,
    subject: 'feat: add blame',
    lineNumber: 1,
    originalLineNumber: 1,
    content: 'const value = 1;',
    ...overrides,
  };
}

describe('BlameFormatter', () => {
  it('formats relative timestamps across boundaries', () => {
    const nowSeconds = NOW / 1000;
    expect(formatRelativeTime(nowSeconds, NOW)).toBe('just now');
    expect(formatRelativeTime(nowSeconds - 60, NOW)).toBe('1 min ago');
    expect(formatRelativeTime(nowSeconds - 120, NOW)).toBe('2 mins ago');
    expect(formatRelativeTime(nowSeconds - 3600, NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(nowSeconds - 86_400, NOW)).toBe('1 day ago');
    expect(formatRelativeTime(nowSeconds - 2_592_000, NOW)).toBe('1 month ago');
    expect(formatRelativeTime(nowSeconds - 31_536_000, NOW)).toBe('1 year ago');
  });

  it('substitutes every supported placeholder', () => {
    const line = createLine();
    const result = formatBlameAnnotation(
      line,
      '${author} | ${relativeDate} | ${subject} | ${shortSha} | ${sha}',
      NOW,
    );

    expect(result).toBe(`Alice | 2 mins ago | feat: add blame | abcdef1 | ${line.sha}`);
  });

  it('uses the default format for blank templates', () => {
    const result = formatBlameAnnotation(createLine(), '   ', NOW);

    expect(result).toBe('Alice, 2 mins ago • feat: add blame');
    expect(DEFAULT_BLAME_FORMAT).toContain('${author}');
  });

  it('renders uncommitted lines without commit metadata', () => {
    const line = createLine({ sha: '0'.repeat(40), subject: '' });

    expect(isUncommittedBlameInfo(line)).toBe(true);
    expect(formatBlameAnnotation(line, '${subject}', NOW)).toBe('Uncommitted changes');
  });

  it('builds hover markdown with metadata, body, and a trusted reveal command', () => {
    const line = createLine();
    const hover = buildBlameHover(line, 'Body line', 'repo-1');
    const value = hover.value;

    expect(hover.isTrusted).toBe(true);
    expect(value).toContain('feat: add blame');
    expect(value).toContain('Alice');
    expect(value).toContain('alice@example.com');
    expect(value).toContain('Body line');
    expect(value).toContain('command:gitGraph.revealCommit?');
  });

  it('encodes repository and sha in the reveal command URI', () => {
    const uri = buildRevealCommitCommandUri('abc123', 'repo with spaces');

    expect(uri).toBe(
      `command:gitGraph.revealCommit?${encodeURIComponent(
        JSON.stringify({ sha: 'abc123', repositoryId: 'repo with spaces' }),
      )}`,
    );
  });
});
