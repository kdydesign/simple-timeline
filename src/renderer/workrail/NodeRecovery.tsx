import {useState} from 'react'
import {TriangleAlert} from 'lucide-react'
import type {NodeManagement} from './useNodeManagement'
import {ConfirmDialog} from '../components/ConfirmDialog'

export function NodeGuidance({node}:{node:NodeManagement}){
 const {state}=node
 if(!state?.supported)return null
 const conflict=state.conflicts.length>0,missing=state.manager.status==='missing',manual=state.manager.status==='error'
 const maintenance=!!state.maintenance?.active
 if(!conflict&&!missing&&!manual&&!maintenance&&!state.removal?.rebootRequired)return null
 if(node.environment?.kind==='wsl2')return <section className="workrail-surface workrail-node-guidance" aria-labelledby="workrail-node-guidance-heading">
  <h3 id="workrail-node-guidance-heading"><TriangleAlert size={16} aria-hidden="true"/>{missing?'nodenv 설치 필요':'nodenv 상태 확인'}</h3>
  <p>선택한 WSL 기본 사용자로 nodenv와 초기화 설정을 확인해 주세요. Node 설치에는 node-build가 필요합니다.</p>
  <details className="workrail-node-details"><summary>공식 안내</summary>
   {state.conflicts.length>0&&<ul>{state.conflicts.map((item,index)=><li key={item.code+index}>{item.message}{item.path&&<code>{item.path}</code>}</li>)}</ul>}
   <code>https://github.com/nodenv/nodenv#installation</code>
   <code>https://github.com/nodenv/node-build#installation</code>
  </details>
 </section>
 const title=maintenance&&state.maintenance?.error?'관리 창 확인 필요':maintenance?'Node 환경 설정 중':conflict?'Node 환경 충돌':missing?'nvm-windows 설치 필요':'nvm-windows 상태 확인'
 const summary=maintenance?null:conflict
  ?missing?'기존 Node.js를 제거한 뒤 nvm-windows를 설치해 주세요.':'Node 설치 경로와 nvm-windows 설정을 확인해 주세요.'
  :missing?'nvm-windows를 설치해 Node 버전을 관리하세요.':'nvm-windows 설치 상태를 확인한 뒤 환경을 다시 검사해 주세요.'
 const manualLink=manual||missing&&(state.removal?.status==='manual'||state.error?.code==='download-failed')
 const details=conflict||!!state.removal?.reason||manualLink
 return <section className="workrail-surface workrail-node-guidance" aria-labelledby="workrail-node-guidance-heading">
  <h3 id="workrail-node-guidance-heading"><TriangleAlert size={16} aria-hidden="true"/>{title}</h3>
  {summary&&<p>{summary}</p>}
  <NodeRecovery node={node}/>
  {details&&<details className="workrail-node-details"><summary>자세히</summary>
   {conflict&&<ul>{state.conflicts.map((item,index)=><li key={item.code+index}>{item.message}{item.path&&<code>{item.path}</code>}</li>)}</ul>}
   {state.removal?.reason&&<p>{state.removal.reason}</p>}
   {manualLink&&<p>공식 nvm-windows 설치 안내에서 설치와 설정을 확인한 뒤 환경을 다시 검사해 주세요.
    <code>https://github.com/coreybutler/nvm-windows/releases</code></p>}
  </details>}
 </section>
}

export function NodeRecovery({node}:{node:NodeManagement}){
 const [confirmation,setConfirmation]=useState<{id:string;description:string}|null>(null)
 const {state,busy,mutate}=node
 if(!state?.supported||node.environment?.kind==='wsl2')return null
 const maintenance = state.maintenance
 if (node.openingMaintenance || maintenance?.status === 'preparing') {
  return <p role="status">{maintenance?.status === 'ready' ? '관리 창을 열고 있습니다.' : '독립 관리 창을 준비하고 있습니다.'}</p>
 }
 if (maintenance?.active) return <div className="node-recovery">
  {!maintenance.error && <p role="status">별도 관리 창에서 Node 환경을 설정하고 있습니다.</p>}
  <button type="button" className="workrail-control" onClick={()=>void node.openMaintenance()}>관리 창 열기</button>
  {maintenance.recoveryShortcut && <p className="workrail-note">복구 바로가기: {maintenance.recoveryShortcut}</p>}
 </div>
 if(state.manager.status!=='missing')return state.removal?.rebootRequired?<p role="alert">Windows 재부팅 후 환경을 다시 검사해 주세요.</p>:null
 const removal=state.removal,conflict=state.conflicts.length>0
 const blocked=busy||!!node.error||!!maintenance?.active||!!removal?.rebootRequired||state.error?.code==='operation-unknown'
 const remove=()=>{
  if(maintenance?.required){void node.openMaintenance();return}
  if(!removal?.confirmationId||!removal.target)return
  setConfirmation({id:removal.confirmationId,description:`Node.js ${removal.target.version} · ${removal.target.path}\nNode.js와 npm을 사용할 수 없게 됩니다. 실행 중인 작업을 저장하고 필요한 설정과 전역 npm 도구 목록을 백업해 주세요. 전역 도구는 재설치가 필요할 수 있습니다. Windows 표준 제거 화면에서 계속합니다.`})
 }
 return <div className="node-recovery">
  {conflict&&removal?.status!=='available'&&!removal?.rebootRequired&&<p className="node-recovery-reason">제거할 Node.js 설치 정보를 확인하지 못했습니다.</p>}
  <div className="node-recovery-actions">
  {conflict&&<button type="button" className="workrail-control" disabled={blocked||removal?.status!=='available'} onClick={remove}>Node.js 제거</button>}
  <button type="button" className="workrail-control workrail-primary" disabled={blocked||conflict||!state.checkedAt}
   onClick={()=>void mutate({kind:'install-manager',version:null})}>nvm-windows 설치</button>
  {conflict&&<span className="node-recovery-hint">기존 Node.js 제거 후 설치할 수 있습니다.</span>}
  </div>
  {removal?.rebootRequired&&<p role="alert">Windows 재부팅이 필요합니다. 작업을 저장하고 재부팅한 뒤 환경을 다시 검사해 주세요.</p>}
  {maintenance?.recoveryShortcut&&<p className="workrail-note">복구 바로가기: {maintenance.recoveryShortcut}</p>}
  {confirmation&&<ConfirmDialog title="기존 Node.js를 제거할까요?" message={confirmation.description} confirmLabel="제거 진행"
   onCancel={()=>setConfirmation(null)} onConfirm={()=>{const selected=confirmation;setConfirmation(null);void mutate({kind:'remove-standalone',version:null,confirmationId:selected.id})}}/>}
 </div>
}
