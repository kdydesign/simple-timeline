import {expect,it,vi} from 'vitest'
import {createNodeRouting} from '../../src/main/node-management-routing'
import type {NodeManagementService} from '../../src/main/node-management/service'
it('never allows a development renderer to remove in its parent and blocks changes during handoff',async()=>{
 const getState=vi.fn(async()=>({revision:1})),removeStandalone=vi.fn(),installManager=vi.fn(),open=vi.fn(async()=>{})
 let active=false
 const routing=createNodeRouting({getState,removeStandalone,installManager} as unknown as NodeManagementService,{required:true,isActive:()=>active,open,shortcut:()=>undefined})
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
 const open=vi.fn(async()=>{}),getState=vi.fn(async()=>({revision:1}))
 const routing=createNodeRouting({getState,isBusy:()=>true} as unknown as NodeManagementService,{required:true,isActive:()=>true,open,shortcut:()=>undefined})
 expect((await routing.dispatch(['openMaintenance'],true)).ok).toBe(true)
 expect(open).toHaveBeenCalledOnce()
})
