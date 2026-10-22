import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n/l10n';

describe('extension l10n', () => {
  it('interpolates positional arguments', () => {
    expect(t('Failed to list worktrees: {0}', 'boom')).toBe('Failed to list worktrees: boom');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(t('Worktree path is required.')).toBe('Worktree path is required.');
    expect(t('Hello {1}', 'only-zero')).toBe('Hello {1}');
  });
});
