import { describe, expect, it } from 'vitest';
import {
  formatAbsoluteDate,
  formatRelativeDate,
  formatTooltipDate,
  normalizeTimestamp,
} from '../../src/features/common/dateUtils';

describe('dateUtils', () => {
  const baseNow = 1773853200000; // Reference epoch ms

  describe('normalizeTimestamp', () => {
    it('normalizes seconds timestamps to epoch milliseconds and keeps millisecond timestamps', () => {
      expect(normalizeTimestamp(1700000000)).toBe(1700000000000);
      expect(normalizeTimestamp(1700000000000)).toBe(1700000000000);
    });

    it('converts Date instances to epoch milliseconds', () => {
      const d = new Date(1700000000000);
      expect(normalizeTimestamp(d)).toBe(1700000000000);
    });

    it('parses valid date strings into epoch milliseconds', () => {
      const ts = new Date('2026-01-01T00:00:00Z').getTime();
      expect(normalizeTimestamp('2026-01-01T00:00:00Z')).toBe(ts);
    });

    it('returns 0 for invalid date strings', () => {
      expect(normalizeTimestamp('not-a-date')).toBe(0);
    });
  });

  describe('formatRelativeDate', () => {
    it('returns "just now" for dates within 60 seconds of now', () => {
      expect(formatRelativeDate(baseNow - 10000, baseNow)).toBe('just now');
      expect(formatRelativeDate(baseNow - 59000, baseNow)).toBe('just now');
    });

    it('handles negative diffs (clock skew/future dates) safely as "just now"', () => {
      expect(formatRelativeDate(baseNow + 5000, baseNow)).toBe('just now');
    });

    it('formats minutes ago accurately', () => {
      expect(formatRelativeDate(baseNow - 2 * 60 * 1000, baseNow)).toBe('2m ago');
      expect(formatRelativeDate(baseNow - 45 * 60 * 1000, baseNow)).toBe('45m ago');
    });

    it('formats hours ago accurately', () => {
      expect(formatRelativeDate(baseNow - 2 * 3600 * 1000, baseNow)).toBe('2h ago');
      expect(formatRelativeDate(baseNow - 23 * 3600 * 1000, baseNow)).toBe('23h ago');
    });

    it('formats days ago accurately', () => {
      expect(formatRelativeDate(baseNow - 24 * 3600 * 1000, baseNow)).toBe('1d ago');
      expect(formatRelativeDate(baseNow - 7 * 24 * 3600 * 1000, baseNow)).toBe('7d ago');
      expect(formatRelativeDate(baseNow - 29 * 24 * 3600 * 1000, baseNow)).toBe('29d ago');
    });

    it('formats months ago accurately', () => {
      expect(formatRelativeDate(baseNow - 45 * 24 * 3600 * 1000, baseNow)).toBe('1mo ago');
      expect(formatRelativeDate(baseNow - 180 * 24 * 3600 * 1000, baseNow)).toBe('6mo ago');
    });

    it('formats years ago accurately', () => {
      expect(formatRelativeDate(baseNow - 400 * 24 * 3600 * 1000, baseNow)).toBe('1y ago');
      expect(formatRelativeDate(baseNow - 800 * 24 * 3600 * 1000, baseNow)).toBe('2y ago');
    });

    it('returns raw string fallback if timestamp cannot be parsed', () => {
      expect(formatRelativeDate('unknown-date', baseNow)).toBe('unknown-date');
    });
  });

  describe('formatAbsoluteDate', () => {
    it('formats timestamp into YYYY-MM-DD', () => {
      // 2026-09-18 in UTC/local
      const d = new Date(2026, 8, 18, 12, 0, 0); // Month 8 is September
      expect(formatAbsoluteDate(d.getTime())).toBe('2026-09-18');
    });

    it('returns raw string for unparseable input', () => {
      expect(formatAbsoluteDate('raw-date-string')).toBe('raw-date-string');
    });
  });

  describe('formatTooltipDate', () => {
    it('includes full locale and ISO representation', () => {
      const d = new Date(1700000000000);
      const tooltip = formatTooltipDate(d.getTime());
      expect(tooltip).toContain(d.toISOString());
    });
  });
});
