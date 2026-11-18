import {useState} from 'react'
import type {NodeManagement} from './useNodeManagement'
import {ConfirmDialog} from '../components/ConfirmDialog'

export function NodeRecovery({node}:{node:NodeManagement}){
 const [confirmation,setConfirmation]=useState<{id:string;description:string}|null>(null)
 const {state,busy,mutate}=node
 if(!state?.supported)return null
 if(state.maintenance?.active)return <div className="node-recovery"><p role="status">별도 관리 창에서 Node 환경을 설정하고 있습니다.</p><button type="button" className="workrail-control" onClick={()=>void node.openMaintenance()}>관리 창 열기</button>{state.maintenance.recoveryShortcut&&<p className="workrail-note">복구 바로가기: {state.maintenance.recoveryShortcut}</p>}</div>
 if(state.manager.status!=='missing')return null
 const removal=state.removal,conflict=state.conflicts.length>0,maintenance=state.maintenance
 const blocked=busy||!!node.error||!!maintenance?.active||!!removal?.rebootRequired||state.error?.code==='operation-unknown'
 const remove=()=>{
  if(maintenance?.required){void node.openMaintenance();return}
  if(!removal?.confirmationId||!removal.target)return
  setConfirmation({id:removal.confirmationId,description:`Node.js ${removal.target.version} · ${removal.target.path}\nNode.js와 npm을 사용할 수 없게 됩니다. 실행 중인 작업을 저장하고 필요한 설정과 전역 npm 도구 목록을 백업해 주세요. 전역 도구는 재설치가 필요할 수 있습니다. Windows 표준 제거 화면에서 계속합니다.`})
 }
 return <div className="node-recovery">
  {conflict&&<>
   <p>기존 Node.js가 설치되어 있어 nvm-windows와 충돌합니다. 기존 Node.js를 제거한 뒤 nvm-windows를 설치해 주세요.</p>
   {removal?.target&&<p>Node.js {removal.target.version}<code>{removal.target.path}</code></p>}
   <button type="button" className="workrail-control" disabled={blocked||removal?.status!=='available'} onClick={remove}>기존 Node.js 제거</button>
   {removal?.status!=='available'&&<p className="workrail-note">{removal?.reason??'공식 MSI 제거 대상을 확인할 수 없습니다. Windows 설치된 앱에서 설치 방식과 경로를 확인해 주세요.'}</p>}
  </>}
  <button type="button" className="workrail-control workrail-primary" disabled={blocked||conflict||!state.checkedAt}
   onClick={()=>void mutate({kind:'install-manager',version:null})}>nvm-windows 설치</button>
  {conflict&&<p className="workrail-note">기존 Node 제거 후 충돌이 해소되면 설치할 수 있습니다.</p>}
  {removal?.rebootRequired&&<p role="alert">Windows 재부팅이 필요합니다. 작업을 저장하고 재부팅한 뒤 환경을 다시 검사해 주세요.</p>}
  {maintenance?.active&&<p role="status">별도 관리 창에서 Node 환경을 설정하고 있습니다.</p>}
  {maintenance?.recoveryShortcut&&<p className="workrail-note">복구 바로가기: {maintenance.recoveryShortcut}</p>}
  {confirmation&&<ConfirmDialog title="기존 Node.js를 제거할까요?" message={confirmation.description} confirmLabel="제거 진행"
   onCancel={()=>setConfirmation(null)} onConfirm={()=>{const selected=confirmation;setConfirmation(null);void mutate({kind:'remove-standalone',version:null,confirmationId:selected.id})}}/>}
 </div>
}
