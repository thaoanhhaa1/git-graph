import { describe, it, expect } from 'vitest';
import { GIT_GRAPH_ENGINE_VERSION } from '../src/index';

describe('git-graph package', () => {
  it('exports git graph engine version', () => {
    expect(GIT_GRAPH_ENGINE_VERSION).toBe('0.2.0');
  });
});
