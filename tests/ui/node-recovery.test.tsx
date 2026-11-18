import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {NodeRecovery} from '../../src/renderer/workrail/NodeRecovery'
import type {NodeManagement} from '../../src/renderer/workrail/useNodeManagement'
function node(dev=false){
 const mutate=vi.fn(),openMaintenance=vi.fn()
 return {mutate,openMaintenance,busy:false,available:true,error:null,state:{supported:true,manager:{status:'missing'},conflicts:[{code:'standalone-node'}],removal:{status:'available',confirmationId:'abc',target:{version:'24.22.3',path:'C:\\Program Files\\nodejs\\node.exe'},reason:null,rebootRequired:false},maintenance:{required:dev,active:false}}} as unknown as NodeManagement
}
it('requires explicit confirmation and passes only the inspected identity',async()=>{
 const n=node();render(<NodeRecovery node={n}/>)
 expect(screen.getByRole('button',{name:'nvm-windows 설치'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'기존 Node.js 제거'}))
 expect(n.mutate).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'제거 진행'}))
 await waitFor(()=>expect(n.mutate).toHaveBeenCalledWith({kind:'remove-standalone',version:null,confirmationId:'abc'}))
})
it('hands development removal to independent management without removing in the parent',()=>{
 const n=node(true);render(<NodeRecovery node={n}/>)
 fireEvent.click(screen.getByRole('button',{name:'기존 Node.js 제거'}))
 expect(n.openMaintenance).toHaveBeenCalledOnce()
 expect(n.mutate).not.toHaveBeenCalled()
})
it('can reopen an active recovery window even after nvm becomes ready',()=>{
 const n=node(true);n.state!.manager.status='ready';n.state!.maintenance!.active=true;n.busy=true
 render(<NodeRecovery node={n}/>)
 fireEvent.click(screen.getByRole('button',{name:'관리 창 열기'}))
 expect(n.openMaintenance).toHaveBeenCalledOnce()
 expect(n.mutate).not.toHaveBeenCalled()
})
