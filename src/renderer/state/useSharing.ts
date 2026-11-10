import {useCallback,useEffect,useRef,useState} from 'react'
import type {SharingApi,SharingState} from '../../shared/sharing'
import type {ApiError,Result} from '../../shared/types'
import {sharingDescription} from '../../shared/sharing-status'
export function useSharing(reconcile:()=>Promise<boolean>,ready:boolean,api:SharingApi|undefined=window.timelineSharing) {
 const [state,setState]=useState<SharingState|null>(null),[error,setError]=useState<ApiError|null>(null)
 const [busy,setBusy]=useState(false),[settingsOpen,setSettingsOpen]=useState(false)
 const revision=useRef<number|null>(null),pending=useRef(false),alive=useRef(true),locked=useRef(false),manual=useRef(false)
 const eventVersion=useRef(0),latest=useRef<SharingState|null>(null),read=useRef(reconcile);read.current=reconcile
 const accept=useCallback((next:SharingState)=>{
  if(!alive.current||(revision.current!==null&&next.snapshotRevision<revision.current))return
  eventVersion.current++;latest.current=next;setState(next)
  if(revision.current!==next.snapshotRevision){revision.current=next.snapshotRevision;pending.current=true}
 },[])
 useEffect(()=>{
  alive.current=true;if(!api)return
  const version=eventVersion.current,off=api.onChange(accept)
  void api.getState().then(result=>{
   if(!alive.current||version!==eventVersion.current)return
   if(result.ok)accept(result.data);else setError(result.error)
  }).catch(()=>{if(alive.current)setError({code:'IPC_UNAVAILABLE',message:'공유 설정을 읽지 못했습니다.'})})
  return()=>{alive.current=false;off()}
 },[api,accept])
 useEffect(()=>{
  if(!ready||manual.current||!pending.current)return
  pending.current=false
  void reconcile().then(ok=>{if(!ok)pending.current=true})
 },[state,ready,reconcile,busy])
 useEffect(()=>{
  const token=state?.settingsRequestToken;if(!token||!api)return
  setSettingsOpen(true);void api.acknowledgeSettings({token}).catch(()=>{})
 },[state?.settingsRequestToken,api])
 async function run<T>(operation:()=>Promise<Result<T>>,receiveState=true):Promise<Result<T>> {
  if(locked.current)return{ok:false,error:{code:'DB_BUSY',message:'공유 작업을 마칠 때까지 기다려 주세요.'}}
  locked.current=true;setBusy(true);setError(null)
  try{
   const result=await operation()
   if(!result.ok)setError(result.error)
   else if(receiveState&&result.data&&typeof result.data==='object'&&'snapshotRevision' in result.data)accept(result.data as unknown as SharingState)
   return result
  }catch{
   const error:ApiError={code:'IPC_UNAVAILABLE',message:'공유 작업 결과를 확인하지 못했습니다.'};setError(error);return{ok:false,error}
  }finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 async function sync(){
  if(!api||locked.current)return false
  manual.current=true
  try{
   const result=await run(async():Promise<Result<SharingState>>=>{
    const version=eventVersion.current,result=await api.sync()
    if(!result.ok)return result
    if(result.data.status!=='connected')return{ok:false,error:{code:'STORAGE_IO',message:sharingDescription(result.data)}}
    if(version!==eventVersion.current&&latest.current?.status!=='connected')return{ok:false,error:{code:'STORAGE_IO',message:latest.current?sharingDescription(latest.current):'공유 연결을 확인하지 못했습니다.'}}
    accept(result.data)
    // A newer revision during the local read must be applied before success.
    for(let attempt=0;attempt<3;attempt++){
     const before=revision.current
     if(!await read.current())break
     if(latest.current?.status!=='connected')return{ok:false,error:{code:'STORAGE_IO',message:latest.current?sharingDescription(latest.current):'공유 연결을 확인하지 못했습니다.'}}
     if(before===revision.current){pending.current=false;return{ok:true,data:latest.current}}
    }
    return{ok:false,error:{code:'STORAGE_IO',message:'수신한 자료를 화면에 반영하지 못했습니다. 다시 동기화해 주세요.'}}
   },false)
   return result.ok&&latest.current?.status==='connected'
  }finally{manual.current=false}
 }
 return{state,api,error,busy,settingsOpen,setSettingsOpen,run,sync}
}
