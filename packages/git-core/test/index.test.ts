import { describe, it, expect } from 'vitest';
import { GIT_CORE_VERSION } from '../src/index';

describe('git-core package', () => {
  it('exports git core version', () => {
    expect(GIT_CORE_VERSION).toBe('0.2.0');
  });
});
