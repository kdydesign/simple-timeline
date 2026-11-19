import {expect,it,vi} from 'vitest'
import {createNodeRouting} from '../../src/main/node-management-routing'
import { emptyNodeState } from '../../src/main/node-management/environments'
const state = emptyNodeState('win32', true)
const currentState = () => state
const serviceDefaults: Parameters<typeof createNodeRouting>[0] = {
  currentState, getState: async () => state, refreshCatalog: vi.fn(), isBusy: () => false,
  install: vi.fn(), use: vi.fn(), removeStandalone: vi.fn(), installManager: vi.fn(),
}

it('never allows a development renderer to remove in its parent and blocks changes during handoff',async()=>{
 const getState=vi.fn(async()=>state),removeStandalone=vi.fn(),installManager=vi.fn(),open=vi.fn(async()=>{})
 let active=false
 const routing=createNodeRouting({...serviceDefaults,getState,removeStandalone,installManager},{required:true,isActive:()=>active,open,getState:()=>({status:'idle' as const,error:null,recoveryShortcut:null})})
 expect((await routing.dispatch(['removeStandalone',{confirmed:true,confirmationId:'a'}],true)).ok).toBe(false)
 expect(removeStandalone).not.toHaveBeenCalled()
 expect((await routing.dispatch(['openMaintenance'],false)).ok).toBe(false)
 expect(open).not.toHaveBeenCalled()
 expect((await routing.dispatch(['openMaintenance'],true)).ok).toBe(true)
 active=true
 expect((await routing.dispatch(['installManager'],true)).ok).toBe(false)
 expect(installManager).not.toHaveBeenCalled()
})
it('focuses an existing maintenance window while its shared operation is busy',async()=>{
 const open=vi.fn(async()=>{}),getState=vi.fn(async()=>state)
 const routing=createNodeRouting({...serviceDefaults,getState,isBusy:()=>true},{required:true,isActive:()=>true,open,getState:()=>({status:'idle' as const,error:null,recoveryShortcut:null})})
 expect((await routing.dispatch(['openMaintenance'],true)).ok).toBe(true)
 expect(open).toHaveBeenCalledOnce()
})

it('reports the recovery process exiting before readiness without exposing internal errors',async()=>{
 const { EventEmitter }=await import('node:events')
 const { waitForMaintenanceReady }=await import('../../src/main/node-maintenance/controller')
 const child=Object.assign(new EventEmitter(),{pid:12,send:vi.fn()})
 const open=()=>{const result=waitForMaintenanceReady(child,{session:'private',artifactId:'bundle'});child.emit('exit',1);return result}
 const maintenance={required:true,isActive:()=>false,open,getState:()=>({status:'idle' as const,error:null,recoveryShortcut:null})}
 const service=serviceDefaults
 const result=await createNodeRouting(service,maintenance).dispatch(['openMaintenance'],true)
 expect(result).toMatchObject({ok:false,error:{code:'operation-failed',message:expect.stringContaining('준비 전에 종료')}})
 const raw=await createNodeRouting(service,{...maintenance,open:async()=>{throw Error('private-path-and-token')}}).dispatch(['openMaintenance'],true)
 expect(raw).toMatchObject({ok:false})
 expect(JSON.stringify(raw)).not.toContain('private-path-and-token')
})

it('restricts Windows maintenance to the selected Windows target in development', async () => {
  const open = vi.fn(async () => {})
  const service = { ...serviceDefaults, windowsSelected: () => false }
  const routing = createNodeRouting(service, { required: true, isActive: () => false, open, getState: () => ({ status: 'idle', error: null, recoveryShortcut: null }) })
  expect(await routing.dispatch(['openMaintenance'], true)).toMatchObject({ ok: false })
  expect(open).not.toHaveBeenCalled()
  const snapshot = await routing.dispatch(['getState'], true)
  expect(snapshot).toMatchObject({ ok: true, data: { maintenance: { required: false } } })
})

it('reports maintenance-only changes even while a Node revision is unchanged', async () => {
  const source = { ...state, revision: 23 }
  let active = false
  const routing = createNodeRouting({ ...serviceDefaults, currentState: () => source, getState: async () => source }, {
    required: true, isActive: () => active, open: vi.fn(), getState: () => ({ status: active ? 'ready' : 'idle', error: null, recoveryShortcut: null }),
  })
  const first = routing.decorate()
  active = true
  const next = await routing.dispatch(['getState'], true)
  expect(next).toMatchObject({ ok: true, data: { maintenance: { active: true, status: 'ready' } } })
  if (next.ok) expect(next.data.revision).toBeGreaterThan(first.revision)
})

it('includes the current recovery snapshot if an older command result arrives after it', async () => {
  const older = { ...state, revision: 1, error: { code: 'operation-failed' as const, message: 'previous command' } }
  const current = { ...state, revision: 2, error: { code: 'operation-unknown' as const, message: 'recheck lock' } }
  const routing = createNodeRouting({ ...serviceDefaults, currentState: () => current, use: async () => older }, {
    required: false, isActive: () => false, open: vi.fn(), getState: () => ({ status: 'idle', error: null, recoveryShortcut: null }),
  })
  expect(await routing.dispatch(['use', '22.0.0'], true)).toMatchObject({ ok: true, data: { error: current.error } })
})
