import {it,expect,vi} from 'vitest'
const capture=vi.hoisted(()=>({execute:vi.fn(async(..._args:unknown[])=>({stdout:'{"selected":null,"registered":false,"disabled":false}'}))}))
vi.mock('node:child_process',async()=>{const {promisify}=await import('node:util');const execFile=Object.assign(()=>{}, {[promisify.custom]:capture.execute});return {execFile}})
vi.mock('node:fs/promises',()=>({readFile:async()=> 'trusted bundled registry helper'}))
import {windowsPowerShellEnvironment,windowsLoginStartup} from '../../src/main/windows-login-startup'
it('uses native module discovery for Windows PowerShell without mutating inherited environment',()=>{
 const inherited={PSModulePath:'C:\\Program Files\\PowerShell\\7\\Modules;C:\\custom',Path:'C:\\Windows',PLANRAIL_STARTUP_TARGET:'C:\\Apps\\Planrail.exe'}
 expect(windowsPowerShellEnvironment(inherited)).toEqual({Path:'C:\\Windows',PLANRAIL_STARTUP_TARGET:'C:\\Apps\\Planrail.exe'})
 expect(inherited.PSModulePath).toContain('PowerShell\\7')
})
it('removes alternate Windows environment key casing and preserves execution policy controls',()=>{
 expect(windowsPowerShellEnvironment({psmodulepath:'wrong modules',PsMoDuLePaTh:'also wrong',PSExecutionPolicyPreference:'AllSigned',__PSLockdownPolicy:'4'})).toEqual({PSExecutionPolicyPreference:'AllSigned',__PSLockdownPolicy:'4'})
})

it('forwards native Windows PowerShell child environment while retaining policy and fixed helper arguments',async()=>{
 const platform=Object.getOwnPropertyDescriptor(process,'platform')!,resources=Object.getOwnPropertyDescriptor(process,'resourcesPath')
 try{
  Object.defineProperty(process,'platform',{value:'win32',configurable:true})
  Object.defineProperty(process,'resourcesPath',{value:'/isolated/resources',configurable:true})
  vi.stubEnv('PSModulePath','C:\\Program Files\\PowerShell\\7\\Modules');vi.stubEnv('PSExecutionPolicyPreference','AllSigned')
  await windowsLoginStartup(true).read()
  const [executable,args,options]=capture.execute.mock.calls.at(-1)! as [string,string[],{env:NodeJS.ProcessEnv}]
  expect(executable).toContain('WindowsPowerShell')
  expect(args).toEqual(['-NoLogo','-NoProfile','-NonInteractive','-Command','trusted bundled registry helper'])
  expect(options.env.PSModulePath).toBeUndefined();expect(options.env.PSExecutionPolicyPreference).toBe('AllSigned')
  expect(options.env.PLANRAIL_STARTUP_ACTION).toBe('Read');expect(options.env.PLANRAIL_STARTUP_TARGET).toBe(process.execPath)
 }finally{vi.unstubAllEnvs();Object.defineProperty(process,'platform',platform);if(resources)Object.defineProperty(process,'resourcesPath',resources);else delete (process as any).resourcesPath}
})
