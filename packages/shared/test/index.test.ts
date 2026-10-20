import { describe, it, expect } from 'vitest';
import { ProtocolVersionSchema, SHARED_CONSTANT } from '../src/index';

describe('shared package', () => {
  it('parses protocol version schema', () => {
    const version = ProtocolVersionSchema.parse('1.0.0');
    expect(version).toBe('1.0.0');
  });

  it('exports SHARED_CONSTANT', () => {
    expect(SHARED_CONSTANT).toBe('git-graph-shared');
  });
});
