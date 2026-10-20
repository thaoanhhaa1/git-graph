import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getVsCodeApi,
  setVsCodeApi,
  resetVsCodeApi,
  createMockVsCodeApi,
  postMessageToExtension,
  onMessageFromExtension,
} from '../src/messaging/vscodeApi';
import { createMessage } from '@git-graph/shared';

describe('vscodeApi adapter', () => {
  beforeEach(() => {
    resetVsCodeApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provides a fallback mock api when acquireVsCodeApi is undefined', () => {
    const api = getVsCodeApi<{ count: number }>();
    expect(api).toBeDefined();
    expect(typeof api.postMessage).toBe('function');
    expect(typeof api.getState).toBe('function');
    expect(typeof api.setState).toBe('function');

    expect(api.getState()).toBeUndefined();
    api.setState({ count: 42 });
    expect(api.getState()).toEqual({ count: 42 });
  });

  it('allows overriding with a custom mock api', () => {
    const postSpy = vi.fn();
    const mock = createMockVsCodeApi({ test: true }, postSpy);

    setVsCodeApi(mock);
    const api = getVsCodeApi<{ test: boolean }>();
    expect(api.getState()).toEqual({ test: true });

    const msg = createMessage('app.ready', { timestamp: 123456 });
    postMessageToExtension(msg);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(msg);
  });

  it('caches the api instance across calls', () => {
    const first = getVsCodeApi();
    const second = getVsCodeApi();
    expect(first).toBe(second);

    resetVsCodeApi();
    const third = getVsCodeApi();
    expect(third).not.toBe(first);
  });

  it('subscribes and unsubscribes from window message events cleanly', () => {
    const handler = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    vi.stubGlobal('window', {
      addEventListener,
      removeEventListener,
    });

    const unsubscribe = onMessageFromExtension(handler);
    expect(addEventListener).toHaveBeenCalledWith('message', handler);

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('message', handler);
  });
});
