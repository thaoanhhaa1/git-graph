import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPersistedState,
  savePersistedState,
  getLastMergeFastForwardMode,
  saveLastMergeFastForwardMode,
} from '../../src/stores/persistence';
import { resetVsCodeApi, setVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';

describe('persistence', () => {
  beforeEach(() => {
    resetVsCodeApi();
  });

  it('loads and saves general persisted state', () => {
    expect(loadPersistedState()).toBeUndefined();

    savePersistedState({ selectedBranch: 'feature/login' });
    expect(loadPersistedState()?.selectedBranch).toBe('feature/login');

    savePersistedState({ searchTerm: 'fix bug' });
    expect(loadPersistedState()?.selectedBranch).toBe('feature/login');
    expect(loadPersistedState()?.searchTerm).toBe('fix bug');
  });

  it('gets and saves lastMergeFastForwardMode', () => {
    expect(getLastMergeFastForwardMode()).toBeUndefined();

    saveLastMergeFastForwardMode('no-ff');
    expect(getLastMergeFastForwardMode()).toBe('no-ff');
    expect(loadPersistedState()?.lastMergeFastForwardMode).toBe('no-ff');

    saveLastMergeFastForwardMode('ff-only');
    expect(getLastMergeFastForwardMode()).toBe('ff-only');

    saveLastMergeFastForwardMode('ff');
    expect(getLastMergeFastForwardMode()).toBe('ff');
  });

  it('ignores invalid fast-forward mode values gracefully', () => {
    const mock = createMockVsCodeApi({
      lastMergeFastForwardMode: 'invalid-mode',
    });
    setVsCodeApi(mock);

    expect(getLastMergeFastForwardMode()).toBeUndefined();
  });
});
