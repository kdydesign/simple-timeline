import type {NodeManagementState,NodeManagementResult} from '../shared/node-management'
import {dispatchNodeManagement} from './node-management/ipc-core'
import {nodeManagementError,type NodeManagementService} from './node-management/service'

export function createNodeRouting(service:NodeManagementService,maintenance:{required:boolean;isActive:()=>boolean;open:()=>Promise<unknown>;shortcut:()=>string|undefined}){
 let revision=0
 const decorate=(state:NodeManagementState):NodeManagementState=>({...state,revision:++revision,maintenance:{required:maintenance.required,active:maintenance.isActive(),recoveryShortcut:maintenance.shortcut()}})
 return {decorate,async dispatch(args:unknown[],trusted:boolean):Promise<NodeManagementResult>{
  if(!trusted)return {ok:false,error:nodeManagementError('forbidden')}
  const command=args[0]
  if(command==='openMaintenance'){
   if(args.length!==1||!maintenance.required)return {ok:false,error:nodeManagementError('invalid-request')}
   if(service.isBusy?.()&&!maintenance.isActive())return {ok:false,error:nodeManagementError('busy')}
   try{await maintenance.open();return {ok:true,data:decorate(await service.getState())}}
   catch{return {ok:false,error:{code:'operation-failed',message:'독립 관리 창을 준비하지 못했습니다. 기존 Node는 제거하지 않았습니다. 열린 복구 창과 복구 바로가기를 확인해 주세요.'}}}
  }
  if(command==='removeStandalone'&&maintenance.required)return {ok:false,error:nodeManagementError('forbidden')}
  if(maintenance.isActive()&&!['getState','refreshCatalog'].includes(String(command)))return {ok:false,error:nodeManagementError('busy')}
  const result=await dispatchNodeManagement(service,args,true)
  return result.ok?{ok:true,data:decorate(result.data)}:result
 }}
}
