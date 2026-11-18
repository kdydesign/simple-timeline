import type { ElectronApplication } from 'playwright';

/** Dispose only an isolated test process, not the product's user-facing Exit flow. */
export function createTestAppCleanup(app: ElectronApplication): () => Promise<void> {
  // Capture while the Playwright channel exists; process() is unavailable once
  // a test has already exited the app (for example, the real Exit tests).
  const process = app.process();
  return async () => {
    if (process.exitCode !== null || process.signalCode !== null) return;

    // Subscribe before initiating teardown and keep the existing bounded wait.
    const closed = app.waitForEvent('close', { timeout: 10000 });
    const closing = (async () => {
      // Install the fixture-only exit policy without starting shutdown yet.
      // Playwright's close() then owns both quit and inspector disconnection;
      // a bare app.exit() otherwise relies on a stderr line to detach it.
      await app.evaluate(({ app }) => {
        app.quit = () => { setImmediate(() => app.exit(0)); };
      });
      await app.close();
    })();
    // Observe request failures instead of silently converting them into a timeout.
    await Promise.all([closed, closing]);
  };
}
