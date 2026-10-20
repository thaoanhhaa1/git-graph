export const GitCommandTimeoutMs = {
  fast: 10_000,
  normal: 30_000,
  long: 120_000,
} as const;

export const GitCommandMaxBufferBytes = {
  small: 1 * 1024 * 1024,
  normal: 8 * 1024 * 1024,
  large: 32 * 1024 * 1024,
} as const;
