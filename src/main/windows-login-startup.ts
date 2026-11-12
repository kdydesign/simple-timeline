import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {promisify} from 'node:util'
import {join} from 'node:path'
import {createLoginStartup,type LoginRegistration} from './login-startup'
const execute=promisify(execFile)
export function windowsLoginStartup(packaged:boolean){
 return createLoginStartup({supported:packaged&&process.platform==='win32',execute:async action=>{
  const script=await readFile(join(process.resourcesPath,'windows','login-startup.ps1'),'utf8')
  const {stdout}=await execute(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PLANRAIL_STARTUP_ACTION:action,PLANRAIL_STARTUP_TARGET:process.execPath},windowsHide:true,timeout:10000,maxBuffer:65536})
  const value=JSON.parse(stdout.trim()) as LoginRegistration
  if(!value||![null,true,false].includes(value.selected)||typeof value.registered!=='boolean'||typeof value.disabled!=='boolean')throw Error('Windows 시작 설정을 확인하지 못했습니다.')
  return value
 }})
}
