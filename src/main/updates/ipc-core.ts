import type { UpdateService } from './service'
import type { Result } from '../../shared/types'
import type { UpdateState } from '../../shared/updates'
import { failure, toPublicError } from '../errors'
const hostCommands=['importBundle','publish','withdraw'] as const
const memberCommands=['download','cancel','retry','install'] as const
export async function dispatchUpdateCommand(service:UpdateService|undefined,args:unknown[],trusted:boolean):Promise<Result<UpdateState>>{
 try{
  if(!trusted||args.length!==1||typeof args[0]!=='string')throw failure('FORBIDDEN')
  if(!service)throw failure('DB_NOT_READY')
  const command=args[0],state=service.getState()
  if(command==='getState')return {ok:true,data:state}
  const host=hostCommands.includes(command as typeof hostCommands[number]),member=memberCommands.includes(command as typeof memberCommands[number])
  if((!host&&!member)||(host&&state.role!=='host')||(member&&state.role!=='member')||state.editingBlocked)throw failure('FORBIDDEN')
  const action=service[command as typeof hostCommands[number]|typeof memberCommands[number]]
  await action()
  return {ok:true,data:service.getState()}
 }catch(e){return {ok:false,error:toPublicError(e)}}
}
