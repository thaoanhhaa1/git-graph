import type { CommitPage } from '../domain/commit';
import { DEFAULT_CHUNK_SIZE } from '../domain/commit';

export interface SerializationTimingResult {
  durationMs: number;
  byteLength: number;
  isLarge: boolean;
}

export interface DeserializationTimingResult<T> {
  result: T;
  durationMs: number;
  byteLength: number;
  isLarge: boolean;
}

export const LARGE_PAYLOAD_THRESHOLD_BYTES = 128 * 1024; // 128 KB

/**
 * Serializes a value to JSON while measuring execution duration and payload byte length.
 */
export function measureSerialization<T>(
  value: T,
  thresholdBytes = LARGE_PAYLOAD_THRESHOLD_BYTES,
): { serialized: string } & SerializationTimingResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const serialized = JSON.stringify(value);
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const byteLength =
    typeof Buffer !== 'undefined'
      ? Buffer.byteLength(serialized, 'utf8')
      : new TextEncoder().encode(serialized).length;
  const durationMs = Math.max(0, end - start);
  const isLarge = byteLength >= thresholdBytes;

  return {
    serialized,
    durationMs,
    byteLength,
    isLarge,
  };
}

/**
 * Deserializes a JSON string while measuring execution duration and payload byte length.
 */
export function measureDeserialization<T>(
  jsonString: string,
  parser: (str: string) => T = JSON.parse,
  thresholdBytes = LARGE_PAYLOAD_THRESHOLD_BYTES,
): DeserializationTimingResult<T> {
  const byteLength =
    typeof Buffer !== 'undefined'
      ? Buffer.byteLength(jsonString, 'utf8')
      : new TextEncoder().encode(jsonString).length;

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = parser(jsonString);
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const durationMs = Math.max(0, end - start);
  const isLarge = byteLength >= thresholdBytes;

  return {
    result,
    durationMs,
    byteLength,
    isLarge,
  };
}

/**
 * Splits a CommitPage into smaller chunks to prevent sending oversized JSON payloads over Webview IPC.
 */
export function splitCommitPageIntoChunks(
  page: CommitPage,
  chunkSize = DEFAULT_CHUNK_SIZE,
): CommitPage[] {
  if (page.commits.length <= chunkSize) {
    return [page];
  }

  const chunks: CommitPage[] = [];
  const totalCommits = page.commits.length;
  const totalChunks = Math.ceil(totalCommits / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const isLast = i === totalChunks - 1;
    const slice = page.commits.slice(i * chunkSize, (i + 1) * chunkSize);
    chunks.push({
      commits: slice,
      cursor: isLast ? page.cursor : undefined,
      hasMore: isLast ? page.hasMore : true,
    });
  }

  return chunks;
}
