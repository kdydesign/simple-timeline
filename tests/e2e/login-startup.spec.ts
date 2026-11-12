import {test,expect,type Desktop} from './fixture'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
const require=createRequire(resolve('package.json')),executable=require('electron') as string
const visible=(d:Desktop)=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())
function second(profile:string,args:string[]){
 const env:NodeJS.ProcessEnv={...process.env,SIMPLE_TIMELINE_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE
 const child=spawn(executable,[resolve('artifacts/test-app/main/index.cjs'),...args],{env,stdio:'ignore'})
 return new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('request helper timeout'))},15000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code)})})
}
test.describe('login background launch',()=>{
 test.use({fault:'autostart'})
 test('stays hidden for duplicate autostart, then direct execution shows existing window',async({desktop:d})=>{
  expect(await visible(d)).toBe(false)
  expect(await second(d.profile,['--planrail-autostart'])).toBe(0);expect(await visible(d)).toBe(false)
  expect(await second(d.profile,[])).toBe(0);await expect.poll(()=>visible(d)).toBe(true)
 })
})
test.describe('tray failure on login',()=>{
 test.use({fault:'autostart-tray-failure'})
 test('exposes the window when background startup cannot create tray',async({desktop:d})=>{expect(await visible(d)).toBe(true)})
})
test('cold valid installer helper exits without opening SQLite',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'simple-timeline-cold-helper-'))
 try{expect(await second(profile,['--planrail-install-exit','--planrail-install-target',executable])).toBe(0);expect(existsSync(join(profile,'data','timeline.sqlite3'))).toBe(false)}finally{await rm(profile,{recursive:true,force:true})}
})
test('mismatched installer target keeps dirty editor alive; valid request discards it without confirmation',async({desktop:d})=>{
 await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('폐기할 초안')
 expect(await second(d.profile,['--planrail-install-exit','--planrail-install-target',join(tmpdir(),'other','Planrail.exe')])).toBe(2)
 expect(d.app.process().exitCode).toBeNull()
 const exited=d.app.waitForEvent('close');expect(await second(d.profile,['--planrail-install-exit','--planrail-install-target',executable])).toBe(0);await exited
 expect(await readFile(join(d.profile,'close-confirmed.txt'),'utf8').catch(()=>null)).toBeNull()
 await d.restart();expect(await d.page.evaluate(async()=>{const s=await window.simpleTimeline.getSnapshot();return s.ok?s.data.projects.length:-1})).toBe(0)
})
test.describe('accepted write',()=>{
 test.use({fault:'held-save'})
 test('manual installer request drains accepted save before shutdown',async({desktop:d})=>{
  await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('설치 전 commit')
  await d.page.getByRole('button',{name:'저장',exact:true}).click();await expect(d.page.locator('html')).toHaveAttribute('data-saving','true')
  const exited=d.app.waitForEvent('close');expect(await second(d.profile,['--planrail-install-exit','--planrail-install-target',executable])).toBe(0)
  expect(d.app.process().exitCode).toBeNull();await d.app.evaluate(()=>(globalThis as any).releasePendingSave());await exited
  await d.restart();expect(await d.page.evaluate(async()=>{const s=await window.simpleTimeline.getSnapshot();return s.ok&&s.data.projects.some(p=>p.name==='설치 전 commit')})).toBe(true)
 })
})
