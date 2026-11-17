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
