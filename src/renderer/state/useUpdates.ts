import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import type {UpdateApi,UpdateState} from '../../shared/updates'
export type UpdateAction='download'|'cancel'|'retry'|'install'|'importBundle'|'publish'|'withdraw'
export interface UpdateSafety {known:boolean;dirty:boolean;saving:boolean}
/** Synchronous capture also covers Radix portals outside the application root. */
export function useUpdateGuard(safety:UpdateSafety,api:UpdateApi|undefined=window.timelineUpdates){
 const [frozen,setFrozen]=useState(false),[editingBlocked,setEditingBlocked]=useState(false)
 const latest=useRef<UpdateState|null>(null),safetyRef=useRef(safety),frozenRef=useRef(false),guardGeneration=useRef(0),alive=useRef(true)
 useLayoutEffect(()=>{safetyRef.current=safety},[safety.known,safety.dirty,safety.saving])
 const freeze=useCallback((value:boolean)=>{frozenRef.current=value;document.documentElement.dataset.updateFrozen=String(value);setFrozen(value)},[])
 const accept=useCallback((next:UpdateState)=>{if(!alive.current||(latest.current&&next.revision<latest.current.revision))return;latest.current=next;setEditingBlocked(next.editingBlocked);if(next.editingBlocked)freeze(true)},[freeze])
 useEffect(()=>{
  alive.current=true
  const block=(event:Event)=>{if(!frozenRef.current)return;const target=event.target;if(target instanceof Element&&target.closest('.update-ui,.window-controls'))return;event.preventDefault();event.stopImmediatePropagation()}
  const events=['click','dblclick','pointerdown','pointerup','keydown','beforeinput','input','change','submit','focusout','blur','dragstart','drop']
  events.forEach(name=>window.addEventListener(name,block,true))
  if(!api)return()=>{alive.current=false;events.forEach(name=>window.removeEventListener(name,block,true));delete document.documentElement.dataset.updateFrozen}
  const off=api.onChange(accept)
  const guard=api.onInstallGuard(async request=>{
   const generation=++guardGeneration.current
   if(request.action==='release'){if(!latest.current?.editingBlocked)flushSync(()=>freeze(false));return false}
   flushSync(()=>freeze(true))
   const deadline=Date.now()+28000
   while(alive.current&&generation===guardGeneration.current&&safetyRef.current.saving&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20))
   const current=safetyRef.current
   // Uncommitted date and popup year text are drafts too; never blur them to force a commit.
   const dateDraft=!!document.querySelector('[data-update-dirty="true"]')
   return alive.current&&generation===guardGeneration.current&&current.known&&!current.dirty&&!current.saving&&!dateDraft&&!latest.current?.editingBlocked
  })
  void api.getState().then(result=>{if(!alive.current)return;if(result.ok)accept(result.data)}).catch(()=>{/* No known update state; main cannot install without our guard. */})
  return()=>{alive.current=false;guardGeneration.current++;off();guard();events.forEach(name=>window.removeEventListener(name,block,true));delete document.documentElement.dataset.updateFrozen}
 },[api,accept,freeze])
 return{frozen,editingBlocked}
}
/** View subscriptions stay in the small titlebar/settings subtrees, never the Gantt root. */
export function useUpdates(api:UpdateApi|undefined=window.timelineUpdates){
 const [state,setState]=useState<UpdateState|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const latest=useRef<UpdateState|null>(null),pending=useRef(new Set<UpdateAction>()),alive=useRef(true)
 const accept=useCallback((next:UpdateState)=>{if(!alive.current||(latest.current&&next.revision<latest.current.revision))return;latest.current=next;setState(next);setError(null)},[])
 useEffect(()=>{
  alive.current=true;if(!api)return
  const off=api.onChange(accept)
  void api.getState().then(result=>{if(!alive.current)return;if(result.ok)accept(result.data);else if(!latest.current)setError(result.error.message)}).catch(()=>{if(alive.current&&!latest.current)setError('업데이트 상태를 읽지 못했습니다.')})
  return()=>{alive.current=false;off()}
 },[api,accept])
 const run=useCallback(async(action:UpdateAction)=>{
  if(!api||pending.current.has(action)||(action!=='cancel'&&pending.current.size))return
  pending.current.add(action);setBusy(true);setError(null)
  try{const result=await api[action]();if(alive.current){if(result.ok)accept(result.data);else setError(result.error.message)}}catch{if(alive.current)setError('업데이트 작업 결과를 확인하지 못했습니다. 다시 시도해 주세요.')}
  finally{pending.current.delete(action);if(alive.current)setBusy(pending.current.size>0)}
 },[api,accept])
 return{state,error,busy,run}
}
export type UpdatesView=ReturnType<typeof useUpdates>
