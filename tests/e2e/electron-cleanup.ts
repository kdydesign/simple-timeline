import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ElectronApplication } from 'playwright';

const execFileAsync = promisify(execFile);

/** Dispose only the process tree launched by an isolated fixture, after assertions. */
export function createTestAppCleanup(app: ElectronApplication): () => Promise<void> {
  // Capture the owned ChildProcess before Playwright disposes its channel.
  const child = app.process();
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  return async () => {
    if (exited()) return;
    const pid = child.pid;
    if (!pid || pid < 2 || pid === process.pid) throw Error('Invalid fixture process');

    let terminationError: unknown;
    const closed = new Promise<void>((resolve, reject) => {
      const onExit = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        child.removeListener('exit', onExit);
        reject(Error(`Fixture process ${pid} did not exit within 10000ms${terminationError ? `: ${String(terminationError)}` : ''}`));
      }, 10000);
      child.once('exit', onExit);
    });
    const terminate = (async () => {
      // Match Playwright's owned-tree disposal: Windows launches via cmd.exe;
      // on POSIX it creates a detached process group led by this exact PID.
      // No executable-name match, inspector call, app.quit or user profile is used.
      if (process.platform === 'win32') {
        await execFileAsync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    })().catch(error => { terminationError = error; });
    // An already-exiting process can race the OS command. Only observed exit
    // counts as success; an error while it stays alive still fails the fixture.
    await Promise.all([closed, terminate]);
  };
}
