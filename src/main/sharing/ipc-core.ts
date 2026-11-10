import {CredentialCleanupError} from './secrets'
import type {SharingService} from './service'
import {DomainValidationError} from '../../domain/error'
import {normalizeIPv4,validatePort,parseSharedId} from '../../domain/sharing'
import {normalizeName,normalizeColor,validateId} from '../../domain/normalize'
import {failure,toPublicError} from '../errors'
import type {Result} from '../../shared/types'
const shapes:Record<string,{required:string[];optional?:string[]}>= {
  configureHost:{required:['address','port']},setHosting:{required:['enabled']},connect:{required:['address','port']},
  confirmHost:{required:['pairId','confirmed']},approve:{required:['pairId','confirmed']},saveDevice:{required:['name','ip'],optional:['id']},
  revokeDevice:{required:['id']},saveProject:{required:['name','color','participants'],optional:['id']},
  saveReminder:{required:['id','reminder']},disconnect:{required:['confirmed']},acknowledgeSettings:{required:['token']},
}
function object(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DomainValidationError('input')
  const v=value as Record<string,unknown>
  if(required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw new DomainValidationError('input')
  return v
}
export async function dispatchSharing(service:SharingService|undefined,args:unknown[],trusted:boolean):Promise<Result<unknown>>{
  try{
    if(!trusted)throw failure('FORBIDDEN')
    if(!service)throw failure('DB_NOT_READY')
    if(Buffer.byteLength(JSON.stringify(args),'utf8')>1024*1024)throw new DomainValidationError('input')
    const [command,value]=args
    if(typeof command!=='string')throw new DomainValidationError('input')
    if(command==='getState'||command==='sync'){
      if(args.length!==1)throw new DomainValidationError('input')
      return {ok:true,data:await service[command]()}
    }
    if(!Object.hasOwn(shapes,command)||args.length!==2)throw new DomainValidationError('input')
    const shape=shapes[command],v=object(value,shape.required,shape.optional)
    if(command==='configureHost'||command==='connect'){normalizeIPv4(v.address);validatePort(v.port)}
    if(Object.hasOwn(v,'confirmed')&&v.confirmed!==true)throw new DomainValidationError('confirmed')
    if(Object.hasOwn(v,'enabled')&&typeof v.enabled!=='boolean')throw new DomainValidationError('enabled')
    for(const key of ['pairId','token','id'])if(Object.hasOwn(v,key)&&(typeof v[key]!=='string'||!v[key]))throw new DomainValidationError(key)
    if(command==='saveDevice'){normalizeName(v.name);normalizeIPv4(v.ip)}
    if(command==='saveProject'){
      normalizeName(v.name);normalizeColor(v.color);if(v.id!==undefined)validateId(v.id)
      if(!Array.isArray(v.participants))throw new DomainValidationError('participants')
      for(const participant of v.participants){const p=object(participant,['name','deviceId']);normalizeName(p.name);if(typeof p.deviceId!=='string'||!p.deviceId)throw new DomainValidationError('participants')}
    }
    if(command==='saveReminder'){parseSharedId(v.id as string);object(v.reminder,['daysBefore','time','start','end'])}
    const handler=service[command as keyof SharingService] as (input:unknown)=>unknown
    const data=await handler(value);JSON.stringify(data);return {ok:true,data}
  }catch(error){return {ok:false,error:error instanceof CredentialCleanupError?{code:error.code,message:error.message}:toPublicError(error)}}
}
