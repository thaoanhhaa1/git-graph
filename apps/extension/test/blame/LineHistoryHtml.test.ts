import { describe, expect, it } from 'vitest';
import type { LineHistoryResult } from '@git-graph/shared';
import { getLineHistoryHtml } from '../../src/blame/LineHistoryHtml';
import { MockWebview } from '../__mocks__/vscode';

function buildResult(overrides: Partial<LineHistoryResult> = {}): LineHistoryResult {
  return {
    filePath: 'src/a.ts',
    startLine: 2,
    endLine: 4,
    entries: [
      {
        sha: 'abcdef1234567890abcdef1234567890abcdef12',
        shortSha: 'abcdef1',
        author: 'Alice',
        authorEmail: 'alice@example.com',
        timestamp: 1_700_000_000,
        subject: 'feat: update file',
        filePath: 'src/a.ts',
        diff: '@@ -2,1 +2,1 @@\n-old line\n+new line',
      },
    ],
    ...overrides,
  };
}

function render(result: LineHistoryResult): string {
  const webview = new MockWebview();
  return getLineHistoryHtml(
    webview as unknown as Parameters<typeof getLineHistoryHtml>[0],
    'test-nonce',
    result,
    'repo-1',
  );
}

describe('getLineHistoryHtml', () => {
  it('renders entries with commit metadata, diff highlights, and reveal buttons', () => {
    const html = render(buildResult());

    expect(html).toContain('Line History: src/a.ts');
    expect(html).toContain('Lines 2–4');
    expect(html).toContain('abcdef1');
    expect(html).toContain('feat: update file');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('class="line del"');
    expect(html).toContain('class="line add"');
    expect(html).toContain('class="line hunk"');
    expect(html).toContain('data-sha="abcdef1234567890abcdef1234567890abcdef12"');
    expect(html).toContain('Reveal in Git Graph');
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('repositoryId = "repo-1"');
  });

  it('escapes user-controlled content to prevent HTML injection', () => {
    const html = render(
      buildResult({
        entries: [
          {
            sha: '" onclick="alert(1)"',
            shortSha: '<b>abc</b>',
            author: '<img src=x onerror=alert(1)>',
            authorEmail: 'a&b@example.com',
            timestamp: 0,
            subject: '<script>alert(1)</script>',
            filePath: '<svg/onload=alert(1)>',
            diff: '+<script>alert(1)</script>',
          },
        ],
      }),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-sha="&quot; onclick=&quot;alert(1)&quot;"');
  });

  it('shows an empty state when no history entries exist', () => {
    const html = render(buildResult({ entries: [] }));

    expect(html).toContain('No history found for the selected line range.');
  });
});
