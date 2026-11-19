import type {NodeManagementState,NodeManagementResult} from '../shared/node-management'
import {dispatchNodeManagement,type NodeCommandService} from './node-management/ipc-core'
import {environmentCommandError} from './node-management/environments'
import {nodeManagementError} from './node-management/service'
import {MaintenanceOpenError,type MaintenanceStatus} from './node-maintenance/controller'

export function createNodeRouting(service:NodeCommandService & {currentState():NodeManagementState},maintenance:{required:boolean;isActive:()=>boolean;open:()=>Promise<unknown>;getState:()=>Pick<MaintenanceStatus,'status'|'error'|'recoveryShortcut'>}){
 let revision=0
 const windowsSelected=()=>service.windowsSelected?.()??true
 const decorate=():NodeManagementState=>{
  const state=service.currentState()
  const {status,error,recoveryShortcut}=maintenance.getState()
  return {...state,revision:++revision,maintenance:{required:maintenance.required&&(windowsSelected()||maintenance.isActive()),active:maintenance.isActive(),status,error,recoveryShortcut:recoveryShortcut??undefined}}
 }
 return {decorate,async dispatch(args:unknown[],trusted:boolean):Promise<NodeManagementResult>{
  if(!trusted)return {ok:false,error:nodeManagementError('forbidden')}
  const command=args[0]
  if(command==='openMaintenance'){
   if(args.length!==1||!maintenance.required||(!windowsSelected()&&!maintenance.isActive()))return {ok:false,error:nodeManagementError('invalid-request')}
   if(service.isBusy?.()&&!maintenance.isActive())return {ok:false,error:nodeManagementError('busy')}
   try{await maintenance.open()}
   catch(error){return {ok:false,error:{code:'operation-failed',message:error instanceof MaintenanceOpenError?error.message:'관리 창을 열지 못했습니다. 열린 복구 창을 확인한 뒤 다시 시도해 주세요.'}}}
   const result=await dispatchNodeManagement(service,['getState'],true)
   return result.ok?{ok:true,data:decorate()}:result
  }
  if(command==='removeStandalone'&&maintenance.required)return {ok:false,error:nodeManagementError('forbidden')}
  if(maintenance.isActive()&&!['getState','recheck','refreshCatalog'].includes(String(command)))return {ok:false,error:nodeManagementError('busy')}
  const result=await dispatchNodeManagement(service,args,true)
  if(!result.ok)return result
  const error=environmentCommandError(result.data)
  if(error)return {ok:false,error}
  return {ok:true,data:decorate()}
 }}
}
