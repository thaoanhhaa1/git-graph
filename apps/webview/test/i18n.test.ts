import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, normalizeLocale, setLocale, t } from '../src/i18n';

describe('webview i18n', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('normalizes common VS Code language tags', () => {
    expect(normalizeLocale('vi')).toBe('vi');
    expect(normalizeLocale('vi-VN')).toBe('vi');
    expect(normalizeLocale('ja')).toBe('ja');
    expect(normalizeLocale('zh-cn')).toBe('zh-cn');
    expect(normalizeLocale('zh-TW')).toBe('zh-cn');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });

  it('translates keys and interpolates parameters', () => {
    setLocale('en');
    expect(t('worktree.title')).toBe('Worktrees');
    expect(t('submodule.ahead', { count: 3 })).toBe('3 ahead');

    setLocale('vi-VN');
    expect(getLocale()).toBe('vi');
    expect(t('worktree.title')).toBe('Worktree');
    expect(t('submodule.ahead', { count: 3 })).toBe('Đi trước 3');
  });

  it('falls back to the key for unknown messages', () => {
    expect(t('missing.key')).toBe('missing.key');
  });
});
