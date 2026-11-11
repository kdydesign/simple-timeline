import { test, expect } from './fixture';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(resolve('package.json'));
const visible = (d: import('./fixture').Desktop) => d.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
const control = (d: import('./fixture').Desktop, action: 'show' | 'requestQuit') => d.app.evaluate((_electron, action) => (globalThis as any).desktopController[action](), action);
test('close hides dirty form and restore/minimize/second-instance retain it', async ({ desktop:d }) => {
 const p=d.page;
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
 await p.getByLabel('프로젝트 이름',{exact:true}).fill('숨겨도 유지');
 // Native hide may suspend the renderer before CDP acknowledges the click.
 // Observe main's hidden state, restore, then require that the real click finished.
 const closing=p.getByRole('button',{name:'창 닫기',exact:true}).click().then(()=>null,error=>error);
 await expect.poll(()=>visible(d)).toBe(false);
 await control(d,'show');
 expect(await closing).toBeNull();
 await expect.poll(()=>visible(d)).toBe(true);
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('숨겨도 유지');
 await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
 await control(d,'show');
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
 await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 const env: NodeJS.ProcessEnv={...process.env,SIMPLE_TIMELINE_TEST_PROFILE:d.profile};
 delete env.ELECTRON_RUN_AS_NODE;
 const second=spawn(require('electron'),[resolve('artifacts/test-app/main/index.cjs')],{env,stdio:'ignore'});
 const code=await new Promise<number|null>((done,reject)=>{
  const timer=setTimeout(()=>{second.kill();reject(Error('Second process did not exit'))},15000);
  second.once('error',error=>{clearTimeout(timer);reject(error)});
  second.once('exit',code=>{clearTimeout(timer);done(code)});
 });
 expect(code).toBe(0);
 await expect.poll(()=>visible(d)).toBe(true);
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('숨겨도 유지');
});
test.describe('quit cancellation',()=>{
 test.use({fault:'close-denied'});
 test('actual quit restores dirty editor and allows rejection',async({desktop:d})=>{
  await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
  await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('종료 취소');
  await d.page.getByRole('button',{name:'창 닫기',exact:true}).click();
  await expect.poll(()=>visible(d)).toBe(false);
  await control(d,'requestQuit');
  await expect.poll(()=>readFile(join(d.profile,'close-confirmed.txt'),'utf8').catch(()=>null)).toBe('requested');
  await expect.poll(()=>visible(d)).toBe(true);
  await expect(d.page.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('종료 취소');
 });
});
test.describe('pending save',()=>{
 test.use({fault:'pending-save'});
 test('actual app.quit waits for a real pending save before exit',async({desktop:d})=>{
  await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
  await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('종료 전 저장');
  await d.page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(d.page.locator('html')).toHaveAttribute('data-saving','true');
  await d.page.getByRole('button',{name:'창 닫기',exact:true}).click();
  await expect.poll(()=>visible(d)).toBe(false);
  const began=Date.now(),exited=d.app.waitForEvent('close');
  await d.app.evaluate(({app})=>app.quit());
  await new Promise(resolve=>setTimeout(resolve,200));
  expect(d.app.process().exitCode).toBeNull();
  await exited;
  expect(Date.now()-began).toBeGreaterThanOrEqual(700);
  await d.restart();
  const data = await d.page.evaluate(()=>window.simpleTimeline.getSnapshot());
  expect(data.ok && data.data.projects.some(p=>p.name==='종료 전 저장')).toBe(true);
 });
});
test.describe('tray failure',()=>{
 test.use({fault:'tray-failure'});
 test('failed tray falls back to protected window close',async({desktop:d})=>{
  await expect.poll(()=>readFile(join(d.profile,'tray-error.txt'),'utf8').catch(()=>null)).toBe('reported');
  const exited=d.app.waitForEvent('close');
  await d.page.getByRole('button',{name:'창 닫기',exact:true}).click();
  await exited;
 });
});
test.describe('window close choice',()=>{
 test.use({fault:'close-choice-cancel'});
 test('cancel keeps dirty input and asks again on the next close',async({desktop:d})=>{
  const p=d.page;
  await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
  await p.getByLabel('프로젝트 이름',{exact:true}).fill('선택 취소 유지');
  await p.getByRole('button',{name:'창 닫기',exact:true}).click();
  await expect.poll(()=>readFile(join(d.profile,'close-choice.txt'),'utf8').catch(()=>null)).toBe('requested');
  await expect.poll(()=>visible(d)).toBe(true);
  await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('선택 취소 유지');
  await p.getByRole('button',{name:'창 닫기',exact:true}).click();
  await expect.poll(()=>visible(d)).toBe(true);
 });
});
test('initial bounds fit display and hidden About uses current app metadata without touching input',async({desktop:d})=>{
 const bounds=await d.app.evaluate(({BrowserWindow,screen})=>{
  const w=BrowserWindow.getAllWindows()[0],a=screen.getDisplayMatching(w.getBounds()).workArea;
  return {b:w.getBounds(),a};
 });
 expect(bounds.b.width).toBe(Math.min(1707,bounds.a.width));
 expect(bounds.b.height).toBe(Math.min(820,bounds.a.height));
 await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
 await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('About 입력 보호');
 const info=await d.app.evaluate(async({BrowserWindow,dialog,app})=>{
  BrowserWindow.getAllWindows()[0].hide();
  const original=dialog.showMessageBox;
  let captured:any;
  (dialog as any).showMessageBox=async(options:any)=>{captured=options;return {response:0}};
  try {(globalThis as any).desktopController.showAbout();await Promise.resolve();return {title:captured.title,detail:captured.detail,version:app.getVersion()}}
  finally{dialog.showMessageBox=original}
 });
 expect(info.title).toBe('About Planrail');expect(info.detail).toContain(info.version);expect(info.detail).toContain('daeyong');
 await expect.poll(()=>visible(d)).toBe(false);
 await control(d,'show');
 await expect(d.page.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('About 입력 보호');
});
