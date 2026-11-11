import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { UpdatePublication } from '../../shared/updates'
/** Feed URL is a main-only capability. It never leaves the install adapter. */
export async function createLoopbackFeed(o:{directory:string;publication:UpdatePublication}){
 const capability=randomBytes(32).toString('hex'),prefix=`/${capability}/`,installer=o.publication.manifest.files.find(f=>f.id==='installer')!
 const metadata=Buffer.from(JSON.stringify({version:o.publication.manifest.version,files:[{url:installer.name,size:installer.size,sha512:installer.sha512}],path:installer.name,sha512:installer.sha512}))
 const server=createServer({maxHeaderSize:8192,headersTimeout:5000,requestTimeout:5000},(req,res)=>{
  if(req.headers.origin){res.writeHead(403);res.end();return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  const isMetadata=req.url===prefix+'latest.yml'||(req.url?.startsWith(prefix+'latest.yml?noCache=')&&/^[0-9a-v]{1,16}$/.test(req.url.slice((prefix+'latest.yml?noCache=').length)))
  if(!isMetadata&&req.url!==prefix+installer.name){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-length':isMetadata?metadata.length:installer.size,'content-type':isMetadata?'application/yaml':'application/octet-stream','cache-control':'no-store',connection:'close'})
  if(req.method==='HEAD'){res.end();return}
  if(isMetadata){res.end(metadata);return}
  void pipeline(createReadStream(join(o.directory,installer.name)),res).catch(()=>res.destroy())
 })
 server.maxConnections=5
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve()})})
 const address=server.address();if(!address||typeof address==='string')throw Error('Feed unavailable')
 let closed:Promise<void>|undefined
 const close=()=>closed??=new Promise<void>(resolve=>{clearTimeout(lifetime);server.closeAllConnections();server.close(()=>resolve())})
 const lifetime=setTimeout(()=>{void close()},30*60*1000);lifetime.unref()
 return {url:`http://127.0.0.1:${address.port}${prefix}`,close}
}
