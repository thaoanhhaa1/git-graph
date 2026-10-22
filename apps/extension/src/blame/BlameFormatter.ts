import * as vscode from 'vscode';
import type { BlameLineInfo } from '@git-graph/shared';

export const DEFAULT_BLAME_FORMAT = '${author}, ${relativeDate} • ${subject}';
export const UNCOMMITTED_SHA_PATTERN = /^0+$/;

export function isUncommittedBlameInfo(info: BlameLineInfo): boolean {
  return UNCOMMITTED_SHA_PATTERN.test(info.sha);
}

export function formatRelativeTime(timestampSeconds: number, nowMilliseconds = Date.now()): string {
  const diffSeconds = Math.max(0, Math.floor(nowMilliseconds / 1000) - timestampSeconds);
  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffSeconds < 86_400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffSeconds < 2_592_000) {
    const days = Math.floor(diffSeconds / 86_400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diffSeconds < 31_536_000) {
    const months = Math.floor(diffSeconds / 2_592_000);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(diffSeconds / 31_536_000);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function formatBlameAnnotation(
  info: BlameLineInfo,
  format: string = DEFAULT_BLAME_FORMAT,
  nowMilliseconds = Date.now(),
): string {
  if (isUncommittedBlameInfo(info)) {
    return 'Uncommitted changes';
  }

  const values: Record<string, string> = {
    author: info.author,
    relativeDate: formatRelativeTime(info.timestamp, nowMilliseconds),
    subject: info.subject,
    shortSha: info.shortSha,
    sha: info.sha,
  };

  const template = format.trim() || DEFAULT_BLAME_FORMAT;
  return template
    .replace(/\$\{(author|relativeDate|subject|shortSha|sha)\}/g, (_match, key: string) => {
      return values[key] ?? '';
    })
    .trim();
}

export function formatBlameTimestamp(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString();
}

export function buildRevealCommitCommandUri(sha: string, repositoryId?: string): string {
  const args = repositoryId ? { sha, repositoryId } : { sha };
  return `command:gitGraph.revealCommit?${encodeURIComponent(JSON.stringify(args))}`;
}

export function buildBlameHover(
  info: BlameLineInfo,
  body?: string,
  repositoryId?: string,
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;

  if (isUncommittedBlameInfo(info)) {
    markdown.appendMarkdown('**Uncommitted changes**');
    return markdown;
  }

  markdown.appendMarkdown('**');
  markdown.appendText(info.subject || '(no commit message)');
  markdown.appendMarkdown('**\n\n');
  markdown.appendMarkdown('`');
  markdown.appendText(info.shortSha);
  markdown.appendMarkdown('` • ');
  markdown.appendText(info.author);
  markdown.appendMarkdown(' <');
  markdown.appendText(info.authorEmail);
  markdown.appendMarkdown('>\n\n');
  markdown.appendText(formatBlameTimestamp(info.timestamp));

  if (body?.trim()) {
    markdown.appendMarkdown('\n\n---\n\n');
    markdown.appendText(body.trim());
  }

  markdown.appendMarkdown(
    `\n\n[Reveal in Git Graph](${buildRevealCommitCommandUri(info.sha, repositoryId)})`,
  );

  return markdown;
}
