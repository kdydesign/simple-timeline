import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'

// Linux permits flushing a read-only descriptor; Windows FlushFileBuffers requires
// GENERIC_WRITE. Keep real file IO and impose that OS boundary on every platform.
const flush=vi.hoisted(()=>({flags:new Map<number,string>(),fail:false,completed:false}))
vi.mock('node:fs',async importOriginal=>{
 const fs=await importOriginal<typeof import('node:fs')>()
 return {...fs,openSync:(path:import('node:fs').PathLike,flags:string,mode?:number)=>{
  const fd=fs.openSync(path,flags,mode);flush.flags.set(fd,flags);return fd
 },fsyncSync:(fd:number)=>{
  if(flush.fail||!/[wa+]/.test(flush.flags.get(fd)??''))throw Object.assign(new Error('flush requires writable handle'),{code:'EPERM'})
  fs.fsyncSync(fd);flush.completed=true
 },closeSync:(fd:number)=>{flush.flags.delete(fd);fs.closeSync(fd)},renameSync:(from:import('node:fs').PathLike,to:import('node:fs').PathLike)=>{
  if(!flush.completed)throw Error('credential replacement before durable flush')
  fs.renameSync(from,to);flush.completed=false
 }}
})
const directories:string[]=[]
afterEach(()=>{flush.flags.clear();flush.fail=false;flush.completed=false;for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true})})
function fixture(){
 const profile=mkdtempSync(join(tmpdir(),'planrail-secret-flush-'));directories.push(profile)
 const secrets=createProtectedSecrets(profile,{isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'kwallet',encryptStringAsync:async value=>Buffer.from(`protected:${value}`),decryptStringAsync:async value=>({result:value.toString().slice(10),shouldReEncrypt:false})})
 return {secrets,directory:join(profile,'sharing-secrets'),ref:'1'.repeat(32)}
}
it('atomically replaces protected credentials through a Windows-compatible durable flush',async()=>{
 const {secrets,directory,ref}=fixture()
 await secrets.write(ref,{token:'old'},()=>true)
 await secrets.write(ref,{token:'new'},()=>true)
 expect(readFileSync(join(directory,ref),'utf8')).toBe('protected:{"token":"new"}')
 expect(await secrets.read(ref,()=>true)).toEqual({token:'new'})
 expect(readdirSync(directory)).toEqual([ref])
})
it('preserves committed credentials and removes the partial file when flush fails',async()=>{
 const {secrets,directory,ref}=fixture()
 await secrets.write(ref,{token:'old'},()=>true);flush.fail=true
 await expect(secrets.write(ref,{token:'new'},()=>true)).rejects.toMatchObject({code:'EPERM'})
 expect(readFileSync(join(directory,ref),'utf8')).toBe('protected:{"token":"old"}')
 expect(readdirSync(directory)).toEqual([ref])
})
