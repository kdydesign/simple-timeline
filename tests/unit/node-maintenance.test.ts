import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cleanMaintenanceEnvironment, prepareMaintenance, validateReadyMessage } from '../../src/main/node-maintenance/runtime'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, {recursive:true,force:true}))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'workrail-maintenance-test-')); directories.push(root)
  const runtimeDirectory=join(root,'node_modules','electron','dist'),buildDirectory=join(root,'out'),maintenanceRoot=join(root,'profile','recovery')
  for(const dir of [runtimeDirectory,join(buildDirectory,'main','maintenance-ui'),join(buildDirectory,'preload')]) await mkdir(dir,{recursive:true})
  await writeFile(join(runtimeDirectory,'electron.exe'),'electron-runtime')
  await writeFile(join(runtimeDirectory,'icudtl.dat'),'runtime-data')
  await writeFile(join(buildDirectory,'main','node-maintenance.cjs'),'require("node:fs");require("electron");require("./service.cjs")')
  await writeFile(join(buildDirectory,'main','service.cjs'),'module.exports = {}')
  await writeFile(join(buildDirectory,'main','index.cjs'),'require("better-sqlite3")')
  await writeFile(join(buildDirectory,'preload','node-maintenance.cjs'),'require("electron")')
  for(const name of ['index.html','app.js','style.css']) await writeFile(join(buildDirectory,'main','maintenance-ui',name),name)
  return {runtimeDirectory,buildDirectory,maintenanceRoot,version:'1.0.0'}
}
describe('independent Node maintenance runtime',()=>{
  it('copies only the maintenance dependency graph and preserves it when the development build disappears',async()=>{
    const input=await fixture(), prepared=await prepareMaintenance(input)
    await rm(input.buildDirectory,{recursive:true});await rm(input.runtimeDirectory,{recursive:true})
    expect(await readFile(prepared.executable,'utf8')).toBe('electron-runtime')
    expect(await readFile(join(prepared.appDirectory,'main','service.cjs'),'utf8')).toBe('module.exports = {}')
    await expect(readFile(join(prepared.appDirectory,'main','index.cjs'))).rejects.toThrow()
    expect(JSON.parse(await readFile(join(prepared.appDirectory,'package.json'),'utf8')).main).toBe('main/node-maintenance.cjs')
  })
  it('refuses overwritten versioned artifacts instead of trusting an existing directory',async()=>{
    const input=await fixture(), prepared=await prepareMaintenance(input)
    await writeFile(prepared.executable,'tampered')
    await expect(prepareMaintenance(input)).rejects.toThrow(/integrity/i)
  })
  it('rejects dependencies requiring node_modules and missing or linked source assets',async()=>{
    const input=await fixture()
    await writeFile(join(input.buildDirectory,'main','service.cjs'),'require("better-sqlite3")')
    await expect(prepareMaintenance(input)).rejects.toThrow(/dependency/i)
    await writeFile(join(input.buildDirectory,'main','service.cjs'),'')
    await rm(join(input.runtimeDirectory,'icudtl.dat'))
    await symlink(join(input.runtimeDirectory,'electron.exe'),join(input.runtimeDirectory,'icudtl.dat'))
    await expect(prepareMaintenance(input)).rejects.toThrow(/symbolic/i)
  })
  it('uses a strict environment allowlist without Node, Vite, Electron or debug configuration',()=>{
    expect(cleanMaintenanceEnvironment({SystemRoot:'C:\\Windows',PATH:'bad',NODE_OPTIONS:'--inspect',ELECTRON_RUN_AS_NODE:'1',VITE_DEV_SERVER_URL:'http://localhost',APPDATA:'profile',TEMP:'temp',SECRET:'token'})).toEqual({SystemRoot:'C:\\Windows',APPDATA:'profile',TEMP:'temp'})
  })
  it('requires the expected child PID, session, artifact identity and readiness evidence',()=>{
    const expected={pid:91,session:'s',artifactId:'a'}
    const message={type:'ready',...expected,rendererReady:true,shortcutReady:true,recoveryShortcut:'recover.lnk'}
    expect(validateReadyMessage(message,expected)).toBe(true)
    for(const patch of [{pid:92},{session:'other'},{artifactId:'other'},{rendererReady:false},{shortcutReady:false}]) expect(validateReadyMessage({...message,...patch},expected)).toBe(false)
  })
})

describe('maintenance handoff',()=>{
  it('does not authorize a child with a mismatched session and only acknowledges verified readiness',async()=>{
    const { EventEmitter }=await import('node:events')
    const { waitForMaintenanceReady }=await import('../../src/main/node-maintenance/controller')
    const child=Object.assign(new EventEmitter(),{pid:12,send:(message:unknown,done:(error:Error|null)=>void)=>{sent.push(message);done(null)}})
    const sent:unknown[]=[]
    const pending=waitForMaintenanceReady(child,{session:'secret',artifactId:'bundle'},{timeoutMs:1000})
    child.emit('message',{type:'ready',pid:12,session:'other',artifactId:'bundle',rendererReady:true,shortcutReady:true,recoveryShortcut:'recover.lnk'})
    expect(sent).toEqual([])
    child.emit('message',{type:'ready',pid:12,session:'secret',artifactId:'bundle',rendererReady:true,shortcutReady:true,recoveryShortcut:'recover.lnk'})
    expect(await pending).toEqual({ready:true,pid:12,recoveryShortcut:'recover.lnk'})
    expect(sent).toEqual([{type:'accepted',session:'secret',artifactId:'bundle'}])
  })
  it('fails closed if the process exits before its static renderer is ready',async()=>{
    const { EventEmitter }=await import('node:events')
    const { waitForMaintenanceReady }=await import('../../src/main/node-maintenance/controller')
    const child=Object.assign(new EventEmitter(),{pid:12,send:()=>{throw Error('Must not acknowledge')}})
    const pending=waitForMaintenanceReady(child,{session:'secret',artifactId:'bundle'},{timeoutMs:1000})
    child.emit('exit',1)
    await expect(pending).rejects.toThrow(/준비 전에 종료/)
  })
})

it('rejects additional runtime files and linked artifact directories during verification',async()=>{
  const { verifyMaintenance }=await import('../../src/main/node-maintenance/runtime')
  const input=await fixture(), prepared=await prepareMaintenance(input)
  const extra=join(prepared.directory,'runtime','injected.dll')
  await writeFile(extra,'unexpected')
  await expect(verifyMaintenance(prepared.directory)).rejects.toThrow(/integrity/i)
})

it('fails readiness on timeout without terminating the independent process',async()=>{
  const { EventEmitter }=await import('node:events')
  const { waitForMaintenanceReady }=await import('../../src/main/node-maintenance/controller')
  let killed=false
  const child=Object.assign(new EventEmitter(),{pid:12,send:()=>{},kill:()=>{killed=true}})
  await expect(waitForMaintenanceReady(child,{session:'secret',artifactId:'bundle'},{timeoutMs:5})).rejects.toThrow(/준비 응답/)
  expect(killed).toBe(false)
})

it('accepts busy state only from the bound child, session and verified artifacts',async()=>{
  const { validateMaintenanceStateMessage }=await import('../../src/main/node-maintenance/runtime')
  const expected={pid:12,session:'session',artifactId:'artifact'}
  expect(validateMaintenanceStateMessage({type:'state',...expected,busy:true},expected)).toBe(true)
  for(const patch of [{pid:13},{session:'stale'},{artifactId:'changed'},{busy:'true'},{type:'ready'}]) expect(validateMaintenanceStateMessage({type:'state',...expected,busy:true,...patch},expected)).toBe(false)
})

it('creates an isolated profile and session before Electron paths are registered on first launch',async()=>{
  const { prepareMaintenanceProfile }=await import('../../src/main/node-maintenance/profile')
  const { existsSync, statSync }=await import('node:fs')
  const root=await mkdtemp(join(tmpdir(),'workrail-pristine-maintenance-'));directories.push(root)
  const maintenanceRoot=join(root,'new-account','recovery')
  expect(existsSync(maintenanceRoot)).toBe(false)
  const paths=prepareMaintenanceProfile(maintenanceRoot)
  expect(existsSync(paths.userData)).toBe(true)
  expect(existsSync(paths.sessionData)).toBe(true)
  expect(statSync(paths.userData).isDirectory()).toBe(true)
  expect(statSync(paths.sessionData).isDirectory()).toBe(true)
  expect(paths).toEqual({userData:join(maintenanceRoot,'profile'),sessionData:join(maintenanceRoot,'profile','session')})
  await writeFile(join(paths.userData,'retained-preferences'),'keep')
  expect(prepareMaintenanceProfile(maintenanceRoot)).toEqual(paths)
  expect(await readFile(join(paths.userData,'retained-preferences'),'utf8')).toBe('keep')
})

it('reports a closed IPC channel when the parent cannot deliver acceptance',async()=>{
  const { EventEmitter }=await import('node:events')
  const { waitForMaintenanceReady }=await import('../../src/main/node-maintenance/controller')
  const child=Object.assign(new EventEmitter(),{
    pid:12,
    send:(_message:unknown,done?:(error:Error|null)=>void)=>queueMicrotask(()=>done?.(Error('private pipe name'))),
  })
  const identity={session:'session',artifactId:'artifact'}
  const pending=waitForMaintenanceReady(child,identity,{timeoutMs:1000})
  child.emit('message',{type:'ready',...identity,pid:12,rendererReady:true,shortcutReady:true,recoveryShortcut:'recover.lnk'})
  await expect(pending).rejects.toThrow(/복구 창과 통신/)
})
