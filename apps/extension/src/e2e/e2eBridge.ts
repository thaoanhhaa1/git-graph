const E2E_ENV_FLAG = 'GIT_GRAPH_E2E';
const MAX_RECORDED_MESSAGES = 5_000;

const postedMessages: unknown[] = [];

/**
 * Returns true when the extension is running inside the real-host E2E harness.
 * The harness sets GIT_GRAPH_E2E=1 before launching VS Code.
 */
export function isE2EEnabled(): boolean {
  return process.env[E2E_ENV_FLAG] === '1';
}

/**
 * Records messages posted from the extension to the webview so the E2E suite
 * can observe replies without injecting a real browser runtime.
 */
export function recordPostedMessage(message: unknown): void {
  if (!isE2EEnabled()) {
    return;
  }
  postedMessages.push(message);
  if (postedMessages.length > MAX_RECORDED_MESSAGES) {
    postedMessages.splice(0, postedMessages.length - MAX_RECORDED_MESSAGES);
  }
}

export function getRecordedMessages(): unknown[] {
  return [...postedMessages];
}

export function clearRecordedMessages(): void {
  postedMessages.length = 0;
}
