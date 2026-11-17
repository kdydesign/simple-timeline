import type { ElectronApplication } from 'playwright';

/** Dispose only an isolated test process, not the product's user-facing Exit flow. */
export function createTestAppCleanup(app: ElectronApplication): () => Promise<void> {
  // Capture while the Playwright channel exists; process() is unavailable once
  // a test has already exited the app (for example, the real Exit tests).
  const process = app.process();
  return async () => {
    if (process.exitCode !== null || process.signalCode !== null) return;

    // Subscribe before exit. Calling app.close() after app.exit() issues another
    // app.quit() through the inspector while Electron is already tearing down.
    const closed = app.waitForEvent('close', { timeout: 10000 });
    // Leave the inspector evaluation before exiting on the normal event loop.
    // The process may close the inspector before it can acknowledge this request;
    // only the actual close event below counts as successful cleanup.
    void app.evaluate(({ app }) => { setImmediate(() => app.exit(0)); }).catch(() => {});
    await closed;
  };
}
