import { useState, useEffect } from 'react';

/**
 * Normalizes input date/timestamp into Unix epoch milliseconds.
 */
export function normalizeTimestamp(timestamp: number | string | Date): number {
  if (typeof timestamp === 'number') {
    if (timestamp <= 0) return 0;
    // Unix epoch seconds from git log (%at / %ct) are ~10 digits (< 1e11).
    // Convert to epoch milliseconds (13 digits).
    return timestamp < 1e11 ? timestamp * 1000 : timestamp;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) {
    const num = Number(timestamp);
    if (!Number.isNaN(num) && num > 0) {
      return num < 1e11 ? num * 1000 : num;
    }
    return 0;
  }
  return parsed > 0 && parsed < 1e11 ? parsed * 1000 : parsed;
}

/**
 * Formats a timestamp into a compact relative time string (e.g. "just now", "5m ago", "2h ago", "3d ago", "2mo ago", "1y ago").
 * Uses the supplied `now` timestamp to avoid creating per-row intervals or timers.
 */
export function formatRelativeDate(
  timestamp: number | string | Date,
  now: number = Date.now(),
): string {
  const ts = normalizeTimestamp(timestamp);
  if (ts === 0) {
    return typeof timestamp === 'string' ? timestamp : '';
  }

  const diffMs = now - ts;

  // Handle clock skew or very recent commits
  if (diffMs < 60 * 1000) {
    return 'just now';
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(diffMs / (30 * 24 * 60 * 60 * 1000));
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(diffMs / (365 * 24 * 60 * 60 * 1000));
  return `${years}y ago`;
}

/**
 * Formats a timestamp into Git Graph standard format (e.g. "4 Aug 2026 23:14").
 */
export function formatGitGraphDate(timestamp: number | string | Date): string {
  const ts = normalizeTimestamp(timestamp);
  if (ts === 0) {
    return typeof timestamp === 'string' ? timestamp : '';
  }
  const date = new Date(ts);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

/**
 * Formats a timestamp into standard ISO/locale date string (e.g. "2026-09-18").
 */
export function formatAbsoluteDate(timestamp: number | string | Date): string {
  const ts = normalizeTimestamp(timestamp);
  if (ts === 0) {
    return typeof timestamp === 'string' ? timestamp : '';
  }
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a timestamp into an accessible, detailed date-time string suitable for tooltips and screen readers.
 */
export function formatTooltipDate(timestamp: number | string | Date): string {
  const ts = normalizeTimestamp(timestamp);
  if (ts === 0) {
    return typeof timestamp === 'string' ? timestamp : '';
  }
  const date = new Date(ts);
  return `${date.toLocaleString()} (${date.toISOString()})`;
}

/**
 * Formats a timestamp into full localized date string e.g. "Wed Oct 07 2026 15:38:21 GMT+0700 (Indochina Time)".
 */
export function formatFullDateTime(timestamp: number | string | Date): string {
  const ts = normalizeTimestamp(timestamp);
  if (ts === 0) {
    return typeof timestamp === 'string' ? timestamp : '';
  }
  const date = new Date(ts);
  return date.toString();
}

/**
 * Custom hook providing a shared tick timestamp at a controlled interval (default: 60s).
 * Used at the top-level container (CommitList) so individual commit rows do not run separate timers.
 */
export function useRelativeTimeTick(intervalMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Avoid active intervals in test environments with 0 or negative ms
    if (intervalMs <= 0) return;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
