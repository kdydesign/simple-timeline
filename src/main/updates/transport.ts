import { request } from 'node:https'
import { checkServerIdentity } from 'node:tls'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Transform, type Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalizeIPv4, validatePort } from '../../domain/sharing'
import { certificatePin, hostServerName } from '../sharing/identity'
import { networkError, SharingNetworkError, type HostTrust } from '../sharing/transport'
import type { SharingAddress } from '../../shared/sharing'
import type { UpdateFile, UpdateFileId, UpdateStatus } from '../../shared/updates'
export const UPDATE_METADATA_LIMIT=1024*1024, UPDATE_HEADERS_MS=5000, UPDATE_IDLE_MS=30000, UPDATE_TOTAL_MS=1800000
export interface UpdateConnection {address:SharingAddress;trust:HostTrust;token:string;localAddress?:string}
type RequestOptions=UpdateConnection&{signal?:AbortSignal}
function openResponse(o:RequestOptions,path:string,stream:boolean):Promise<IncomingMessage>{
 const {trust}=o
 if(trust.serverName!==hostServerName(trust.hostId)||certificatePin(trust.certificate)!==trust.pin)throw new SharingNetworkError('TLS_UNTRUSTED')
 return new Promise((resolve,reject)=>{
  if(o.signal?.aborted){reject(new SharingNetworkError('ABORTED'));return}
  const req=request({host:normalizeIPv4(o.address.address),port:validatePort(o.address.port),localAddress:o.localAddress,servername:trust.serverName,ca:trust.certificate,minVersion:'TLSv1.2',agent:false,
   checkServerIdentity:(_host,cert)=>checkServerIdentity(trust.serverName,cert)??(certificatePin(cert.raw)===trust.pin?undefined:new SharingNetworkError('TLS_UNTRUSTED')),
   path,method:'GET',headers:{authorization:`Bearer ${o.token}`,'x-planrail-update-protocol':'1','x-planrail-protocol':'1',connection:'close'},signal:o.signal})
  const headers=setTimeout(()=>req.destroy(new SharingNetworkError('TIMEOUT')),UPDATE_HEADERS_MS)
  const total=setTimeout(()=>req.destroy(new SharingNetworkError('TIMEOUT')),stream?UPDATE_TOTAL_MS:UPDATE_HEADERS_MS)
  req.once('error',e=>reject(networkError(e)))
  req.once('close',()=>{clearTimeout(headers);clearTimeout(total)})
  req.once('response',res=>{
   clearTimeout(headers);res.setTimeout(UPDATE_IDLE_MS,()=>res.destroy(new SharingNetworkError('TIMEOUT')))
   const status=res.statusCode??0
   if(status!==200){const code=status===401?'UNAUTHORIZED':status===403?'REVOKED':status===404?'UNSUPPORTED':status===409?'REPLACED':status===429?'RATE_LIMITED':status===503?'UNAVAILABLE':'INVALID_RESPONSE';res.resume();reject(new SharingNetworkError(code,status));return}
   resolve(res)
  });req.end()
 })
}
export async function readUpdateStatus(o:RequestOptions):Promise<UpdateStatus>{
 const res=await openResponse(o,'/v1/updates/status',false)
 const chunks:Buffer[]=[];let size=0
 try{if(Number(res.headers['content-length'])>UPDATE_METADATA_LIMIT)throw new SharingNetworkError('INVALID_RESPONSE')
  for await(const chunk of res){size+=chunk.length;if(size>UPDATE_METADATA_LIMIT)throw new SharingNetworkError('INVALID_RESPONSE');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as UpdateStatus}catch{throw new SharingNetworkError('INVALID_RESPONSE')}
 }catch(e){res.destroy();throw e}
}
export async function downloadUpdateFile(o:RequestOptions&{releaseId:string;file:UpdateFile;destination:string;progress?:(bytes:number)=>void}):Promise<void>{
 if(!/^[a-f0-9]{64}$/.test(o.releaseId)||!['installer','metadata','blockmap','guide'].includes(o.file.id))throw new SharingNetworkError('INVALID_REQUEST')
 let created=false
 try{
  const res=await openResponse(o,`/v1/updates/${o.releaseId}/${o.file.id}`,true)
  if(Number(res.headers['content-length'])!==o.file.size){res.destroy();throw new SharingNetworkError('INTEGRITY')}
  const sha256=createHash('sha256'),sha512=createHash('sha512');let size=0
  const verify=new Transform({transform(chunk:Buffer,_encoding,done){size+=chunk.length;if(size>o.file.size){done(new SharingNetworkError('INTEGRITY'));return}sha256.update(chunk);sha512.update(chunk);o.progress?.(size);done(null,chunk)}})
  const output=createWriteStream(o.destination,{flags:'wx',mode:0o600});output.once('open',()=>{created=true})
  await pipeline(res,verify,output,{signal:o.signal})
  if(size!==o.file.size||sha256.digest('hex')!==o.file.sha256||sha512.digest('base64')!==o.file.sha512)throw new SharingNetworkError('INTEGRITY')
 }catch(error){if(created)await rm(o.destination,{force:true});throw error}
}
interface CatalogReader {wireStatus():UpdateStatus;readFile(releaseId:string,id:UpdateFileId):Promise<{file:UpdateFile;stream:Readable;release():void}>}
export type UpdateRoutes=(req:IncomingMessage,res:ServerResponse,authenticate:()=>{id:string})=>Promise<void>
export function createUpdateRoutes(catalog:CatalogReader):UpdateRoutes{
 const streams=new Set<string>()
 return async(req,res,authenticate)=>{
  const device=authenticate()
  if(req.method!=='GET'||req.headers['x-planrail-update-protocol']!=='1')throw new SharingNetworkError('INVALID_REQUEST',400)
  if(req.url==='/v1/updates/status'){
   const body=Buffer.from(JSON.stringify(catalog.wireStatus()));if(body.length>UPDATE_METADATA_LIMIT)throw new SharingNetworkError('INVALID_RESPONSE',500)
   res.writeHead(200,{'content-type':'application/json','content-length':body.length,'cache-control':'no-store',connection:'close'});res.end(body);return
  }
  const match=req.url?.match(/^\/v1\/updates\/([a-f0-9]{64})\/(installer|metadata|blockmap|guide)$/)
  if(!match)throw new SharingNetworkError('NOT_FOUND',404)
  if(streams.has(device.id)||streams.size>=5)throw new SharingNetworkError('RATE_LIMITED',429)
  const publication=catalog.wireStatus().publication,file=publication?.manifest.files.find(f=>f.id===match[2])
  if(publication?.releaseId!==match[1]||!file)throw new SharingNetworkError('REPLACED',409)
  streams.add(device.id)
  let lease:Awaited<ReturnType<CatalogReader['readFile']>>|undefined
  const deadline=setTimeout(()=>res.destroy(),UPDATE_TOTAL_MS)
  req.socket.setTimeout(UPDATE_IDLE_MS)
  try{
   res.writeHead(200,{'content-length':file.size,'content-type':'application/octet-stream','cache-control':'no-store',connection:'close'})
   res.flushHeaders()
   try{lease=await catalog.readFile(match[1],match[2] as UpdateFileId)}catch{throw new SharingNetworkError('REPLACED',409)}
   authenticate()
   if(res.destroyed)return
   const authorize=new Transform({transform(chunk,_encoding,done){try{authenticate();done(null,chunk)}catch(e){done(e as Error)}}})
   await pipeline(lease.stream,authorize,res)
  }finally{clearTimeout(deadline);lease?.stream.destroy();lease?.release();streams.delete(device.id)}
 }
}
