import {randomBytes} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,openSync,fsyncSync,closeSync} from 'node:fs'
import {join} from 'node:path'
import {failure} from '../errors'
export interface SecretVault {
  isAsyncEncryptionAvailable():Promise<boolean>
  getSelectedStorageBackend():string
  encryptStringAsync(value:string):Promise<Buffer>
  decryptStringAsync(value:Buffer):Promise<{result:string;shouldReEncrypt:boolean}>
}
export const secretRef=()=>randomBytes(16).toString('hex')
export function createProtectedSecrets(profile:string,vault:SecretVault){
  const directory=join(profile,'sharing-secrets')
  const path=(ref:string)=>{if(!/^[a-f0-9]{32}$/.test(ref))throw failure('STORAGE_IO');return join(directory,ref)}
  const check=(current:()=>boolean)=>{if(!current())throw failure('FORBIDDEN')}
  async function available(){
    if(!await vault.isAsyncEncryptionAvailable()||(process.platform==='linux'&&vault.getSelectedStorageBackend()==='basic_text'))throw failure('STORAGE_IO')
  }
  async function write(ref:string,value:unknown,current:()=>boolean){
    const dest=path(ref)
    await available()
    const encrypted=await vault.encryptStringAsync(JSON.stringify(value))
    // No await between this fence, atomic replacement and the caller's config commit.
    check(current)
    mkdirSync(directory,{recursive:true,mode:0o700})
    const temporary=dest+'.'+secretRef()+'.partial'
    try{
      writeFileSync(temporary,encrypted,{flag:'wx',mode:0o600})
      const fd=openSync(temporary,'r');try{fsyncSync(fd)}finally{closeSync(fd)}
      renameSync(temporary,dest)
    }finally{rmSync(temporary,{force:true})}
  }
  return {write,async read<T>(ref:string,current:()=>boolean):Promise<T>{
    await available();check(current)
    const decrypted=await vault.decryptStringAsync(readFileSync(path(ref)));check(current)
    const value=JSON.parse(decrypted.result) as T
    if(decrypted.shouldReEncrypt)await write(ref,value,current)
    check(current);return value
  },remove(ref:string){rmSync(path(ref),{force:true})}}
}
export type ProtectedSecrets=ReturnType<typeof createProtectedSecrets>
/** Importing the service never initializes the OS key store. */
export async function electronSecrets(profile:string):Promise<ProtectedSecrets>{
  const {safeStorage}=await import('electron')
  return createProtectedSecrets(profile,safeStorage)
}
