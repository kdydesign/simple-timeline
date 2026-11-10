import { _electron } from 'playwright';
import type { TestInfo } from '@playwright/test';
import type { Desktop } from './fixture';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(resolve('package.json'));

export async function launchMember(info: TestInfo): Promise<Desktop & { dispose(): Promise<void> }> {
  const profile = await mkdtemp(join(tmpdir(), 'simple-timeline-member-'));
  const launch = async () => {
    const began = Date.now(), env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({chromiumSandbox: true, executablePath: require('electron'), args: [resolve('artifacts/test-app/main/index.cjs')], env: {...env, SIMPLE_TIMELINE_TEST_PROFILE: profile, SIMPLE_TIMELINE_TEST_FAULT: 'sharing', SIMPLE_TIMELINE_TEST_SEED: 'single'}});
    app.process().stderr?.on('data', chunk => void appendFile(info.outputPath('member-electron.log'), chunk));
    const page = await app.firstWindow();
    await page.getByRole('button', {name:'프로젝트 추가', exact:true}).waitFor();
    return {app,page,launchMs:Date.now()-began,launchedAt:began};
  };
  const desktop = {...await launch(), profile, async restart() { await desktop.app.close(); Object.assign(desktop,await launch()); }, async dispose() {
    await desktop.app.evaluate(({app}) => app.exit(0)).catch(()=>{});
    await desktop.app.close().catch(()=>{});
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }};
  return desktop;
}
export async function settings(d: Desktop) {
  await d.app.evaluate(() => (globalThis as any).desktopController.openSharingSettings());
  return d.page.getByRole('dialog',{name:'공유 설정'});
}
export const sharingState = (d: Desktop) => d.page.evaluate(async () => {
  const r = await window.timelineSharing!.getState();
  if (!r.ok) throw Error(r.error.message);
  return r.data;
});
export const snapshot = (d: Desktop) => d.page.evaluate(async () => {
  const r = await window.simpleTimeline.getSnapshot();
  if (!r.ok) throw Error(r.error.message);
  return r.data;
});
