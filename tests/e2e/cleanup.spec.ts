import { test, expect } from './fixture';
import { launchMember } from './sharing-fixture';

test('isolated cleanup waits for actual exit and tolerates a second disposal', async ({ desktop }) => {
  // Opening an editor leaves unsaved input: fixture cleanup must not depend on
  // the renderer's interactive close guard or leave a hidden process behind.
  await desktop.page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  const process = desktop.app.process();
  await desktop.stopApp();
  expect(process.exitCode !== null || process.signalCode !== null).toBe(true);
  await desktop.stopApp();
  expect(process.exitCode !== null || process.signalCode !== null).toBe(true);
});

test('cleanup accepts a process already closed through normal app quit', async ({ desktop }) => {
  const process = desktop.app.process();
  await desktop.app.close();
  expect(process.exitCode).toBe(0);
  await desktop.stopApp();
});

test('cleanup terminates its process even when inspector requests are unavailable', async ({ desktop }) => {
  const child = desktop.app.process();
  const evaluate = desktop.app.evaluate;
  desktop.app.evaluate = async () => { throw Error('fixture inspector unavailable'); };
  try {
    await desktop.stopApp();
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  } finally {
    desktop.app.evaluate = evaluate;
  }
});

test('cleanup leaves a separately launched Electron process usable', async ({ desktop }, info) => {
  const other = await launchMember(info);
  try {
    await desktop.stopApp();
    await expect(other.page.getByRole('button', { name: '프로젝트 추가', exact: true })).toBeVisible();
    expect(other.app.process().exitCode).toBeNull();
    expect(other.app.process().signalCode).toBeNull();
  } finally {
    await other.dispose();
  }
});
