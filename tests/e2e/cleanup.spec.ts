import { test, expect } from './fixture';

test('isolated cleanup waits for actual exit and tolerates a second disposal', async ({ desktop }) => {
  // Opening an editor leaves unsaved input: fixture cleanup must not depend on
  // the renderer's interactive close guard or leave a hidden process behind.
  await desktop.page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  const process = desktop.app.process();
  await desktop.stopApp();
  expect(process.exitCode).toBe(0);
  await desktop.stopApp();
  expect(process.exitCode).toBe(0);
});

test('cleanup accepts a process already closed through normal app quit', async ({ desktop }) => {
  const process = desktop.app.process();
  await desktop.app.close();
  expect(process.exitCode).toBe(0);
  await desktop.stopApp();
});

test('cleanup releases the inspector without relying on a stderr shutdown message', async ({ desktop }) => {
  // Characterize our teardown boundary: the real process must exit even if the
  // diagnostic line used by Playwright's passive disconnect listener is lost.
  const process = desktop.app.process();
  const stderr = process.stderr!;
  const emit = stderr.emit;
  stderr.emit = function(event: string | symbol, ...args: unknown[]) {
    if (event === 'data' && String(args[0]).includes('Waiting for the debugger to disconnect...')) {
      args[0] = Buffer.from(String(args[0]).replace(/Waiting for the debugger to disconnect\.\.\./g, ''));
    }
    return Reflect.apply(emit, this, [event, ...args]);
  };
  try {
    await desktop.stopApp();
    expect(process.exitCode).toBe(0);
  } finally {
    stderr.emit = emit;
    // Release a deliberately stranded inspector on the pre-fix implementation.
    if (process.exitCode === null) await desktop.app.close();
  }
});
