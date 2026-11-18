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

test('cleanup accepts concurrent exit after the initial process check', async ({ desktop }) => {
  const process = desktop.app.process();
  const evaluate = desktop.app.evaluate;
  // Exercise the real process exit between the helper's alive check and its
  // inspector request, as when a product Exit test finishes before cmd.exe.
  desktop.app.evaluate = async () => {
    await desktop.app.close();
    throw Error('Inspector closed during concurrent shutdown');
  };
  try {
    await desktop.stopApp();
    expect(process.exitCode).toBe(0);
  } finally {
    desktop.app.evaluate = evaluate;
  }
});

test('cleanup still fails when the inspector rejects shutdown and the process stays alive', async ({ desktop }) => {
  const process = desktop.app.process();
  const evaluate = desktop.app.evaluate;
  desktop.app.evaluate = async () => { throw Error('fixture rejected shutdown'); };
  try {
    await expect(desktop.stopApp()).rejects.toThrow('fixture rejected shutdown');
    expect(process.exitCode).toBeNull();
  } finally {
    desktop.app.evaluate = evaluate;
  }
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
