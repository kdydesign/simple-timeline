// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { waitFor } from '@testing-library/dom'

const initial = () => ({
  checkedAt:'2026-11-18',manager:{status:'missing',version:null},activeVersion:'24.1.0',activeSource:'standalone',installedVersions:[],busy:null,error:null,
  removal:{status:'available',target:{version:'24.1.0',path:'C:\\Program Files\\nodejs\\node.exe'},confirmationId:'confirmed-target',rebootRequired:false,reason:null},
  conflicts:[{message:'기존 Node.js',path:'C:\\Program Files\\nodejs'}],
  catalog:{releases:[{version:'24.22.1',npm:'11.1.0',lts:'Krypton'}],status:'ready',error:null},
})
const click=(id:string)=>(document.getElementById(id) as HTMLButtonElement).click()
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement
function mount(accepted=true) {
  let state:any=initial(),listener:(state:unknown)=>void=()=>{}
  const result=async()=>({ok:true,data:state})
  const api={ready:vi.fn(async()=>({ok:true,ready:true,accepted,recoveryShortcut:'start menu/recover.lnk'})),getState:vi.fn(result),refreshCatalog:vi.fn(result),removeStandalone:vi.fn(result),installManager:vi.fn(result),install:vi.fn(result),use:vi.fn(result),openRecoveryLocation:vi.fn(async()=>({ok:true})),onChange:(callback:typeof listener)=>{listener=callback}}
  Object.assign(window,{nodeMaintenance:api})
  document.documentElement.innerHTML=readFileSync('src/renderer/node-maintenance/index.html','utf8').replace(/<!doctype html>/i,'')
  window.eval(`(function(){${readFileSync('src/renderer/node-maintenance/app.js','utf8')}\n})()`)
  return {api,change(next:any){state=next;listener(state)},get state(){return state}}
}
afterEach(()=>{document.body.replaceChildren();vi.useRealTimers()})
it('requires separate user actions for removal, manager install, Node install and use',async()=>{
  const {api,change,state}=mount()
  await waitFor(()=>expect(button('remove').disabled).toBe(false))
  expect(button('manager').disabled).toBe(true)
  click('remove')
  await waitFor(()=>expect(api.removeStandalone).toHaveBeenCalledWith('confirmed-target'))
  expect(api.installManager).not.toHaveBeenCalled()
  await waitFor(()=>expect(button('refresh').disabled).toBe(false))
  const cleared={...state,activeVersion:null,activeSource:null,conflicts:[],removal:{...state.removal,status:'unavailable',target:null,confirmationId:null}}
  change(cleared)
  expect(button('manager').disabled).toBe(false)
  expect(api.installManager).not.toHaveBeenCalled()
  click('manager')
  await waitFor(()=>expect(api.installManager).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(button('refresh').disabled).toBe(false))
  const managed={...cleared,manager:{status:'ready',version:'1.2.2'}}
  change(managed)
  ;(document.querySelector('#versions button') as HTMLButtonElement).click()
  await waitFor(()=>expect(api.install).toHaveBeenCalledWith('24.22.1'))
  expect(api.use).not.toHaveBeenCalled()
  await waitFor(()=>expect(button('refresh').disabled).toBe(false))
  change({...managed,installedVersions:['24.22.1']})
  ;(document.querySelector('#versions button') as HTMLButtonElement).click()
  await waitFor(()=>expect(api.use).toHaveBeenCalledWith('24.22.1'))
})
it('does not enable removal before validated parent handoff',async()=>{
  vi.useFakeTimers()
  const {api}=mount(false)
  await Promise.resolve();await Promise.resolve()
  expect(button('remove').disabled).toBe(true)
  click('remove')
  expect(api.removeStandalone).not.toHaveBeenCalled()
  vi.clearAllTimers()
})
