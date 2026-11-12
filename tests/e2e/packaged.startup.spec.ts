import {test,expect} from '@playwright/test'
import {_electron,type ElectronApplication} from 'playwright'
import {execFileSync,spawn,spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const powershell=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
const envFor=(extra:NodeJS.ProcessEnv={}):Record<string,string>=>Object.fromEntries(Object.entries({...process.env,...extra}).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[0]!=='ELECTRON_RUN_AS_NODE'))
const command=(script:string,extra:NodeJS.ProcessEnv={})=>execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{env:envFor(extra),encoding:'utf8',timeout:30000}).trim()
const waitExit=(child:ReturnType<typeof spawn>)=>new Promise<number|null>((done,reject)=>{const timer=setTimeout(()=>reject(Error('Child exit timeout')),15000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);done(code)})})
test('actual0.8.0 manual migration and assisted startup choices preserve OS disable, committed data, update and uninstall contracts',async({},info)=>{
 test.setTimeout(360000)
 if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Disposable GitHub Windows VM required')
 const appData=command("[Environment]::GetFolderPath('ApplicationData')"),profile=join(appData,'SimpleTimeline')
 if(existsSync(profile))throw Error('Refusing an existing profile')
 const base=JSON.parse(await readFile('release/release-manifest.json','utf8')),legacy=JSON.parse(await readFile('artifacts/windows-legacy-startup/release-manifest.json','utf8'))
 expect(legacy.sourceSha).toBe('bde6edf63b8f16f6be4943f864aca2e585339245');expect(legacy.version).toBe('0.8.0')
 const directory=join(process.env.RUNNER_TEMP!,'Planrail startup path 🛤 '+Date.now()),exe=join(directory,'Planrail.exe'),installer=resolve('release',base.installer)
 const startupSource=await readFile('resources/windows/login-startup.ps1','utf8'),gateSource=await readFile('resources/windows/install-gate.ps1','utf8')
 const startup=(action:string)=>JSON.parse(command(startupSource,{PLANRAIL_STARTUP_ACTION:action,PLANRAIL_STARTUP_TARGET:exe}))
 const gate=(manual:boolean)=>spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',gateSource],{env:envFor({PLANRAIL_INSTALL_TARGET:exe,PLANRAIL_INSTALL_MANUAL:manual?'1':'0'}),encoding:'utf8',timeout:55000})
 const silent=(file=installer,args:string[]=[])=>{const result=spawnSync(file,['/S',...args,'/D='+directory],{timeout:90000,encoding:'utf8'});expect(result.status,result.stderr).toBe(0)}
 const interactive=(startup:'On'|'Off'|'Keep'='Keep',expectFailure=false)=>JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/testing/windows-installer-ui.ps1'),'-Installer',installer,'-Directory',directory,'-Startup',startup,...(expectFailure?['-ExpectFailure']:[])],{encoding:'utf8',timeout:140000}))
 const evidence:Record<string,unknown>={sourceSha:base.sourceSha,legacySourceSha:legacy.sourceSha,legacyInstallerSha256:legacy.sha256,executionPolicy:command('Get-ExecutionPolicy'),windowsPowerShell:command('$PSVersionTable.PSVersion.ToString()'),windowsAnsiCodePage:command('[Text.Encoding]::Default.CodePage'),unicodeInstallationPath:directory,cases:[]}
 const cases=evidence.cases as unknown[]
 let instance:ElectronApplication|undefined,restoreAcl:string|undefined
 const launch=async(path=exe,args:string[]=[])=>{instance=await _electron.launch({chromiumSandbox:true,executablePath:path,args,env:envFor(),timeout:30000});const page=await instance.firstWindow();await page.getByRole('button',{name:'프로젝트 추가',exact:true}).waitFor();return page}
 const close=async()=>{if(!instance)return;await instance.evaluate(({app})=>app.exit(0)).catch(()=>{});await instance.close().catch(()=>{});instance=undefined}
 const snapshot=async()=>{const page=await instance!.firstWindow();return page.evaluate(async()=>{const result=await window.simpleTimeline.getSnapshot();if(!result.ok)throw Error('DB unavailable');return result.data})}
 const uninstall=async()=>{const file=(await readdir(directory)).find(p=>p.startsWith('Uninstall')&&p.endsWith('.exe'));if(!file)throw Error('Uninstaller missing');const result=spawnSync(join(directory,file),['/S'],{timeout:90000,encoding:'utf8'});expect(result.status,result.stderr).toBe(0);await expect.poll(()=>existsSync(exe),{timeout:30000}).toBe(false)}
 await mkdir(info.outputDir,{recursive:true})
 try{
  expect(startup('Read')).toMatchObject({selected:null,registered:false})
  silent(resolve('artifacts/windows-legacy-startup',legacy.installer));expect(startup('Read').registered).toBe(false)
  // A real old binary from a different path remains alive; helper only scopes its target.
  let page=await launch(resolve('artifacts/windows-legacy-startup/win-unpacked/Planrail.exe'))
  expect(gate(true).status).toBe(0);expect(instance!.process().exitCode).toBeNull();await close();cases.push('other-path process untouched')
  page=await launch();expect(await instance!.evaluate(({app})=>app.getVersion())).toBe('0.8.0')
  await page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await page.getByLabel('프로젝트 이름',{exact:true}).fill('commit before manual install');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.saving-shield')).toHaveCount(0)
  await page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await page.getByLabel('프로젝트 이름',{exact:true}).fill('discard old draft')
  const native=gateSource.match(/Add-Type -TypeDefinition @'\r?\n[\s\S]*?\r?\n'@/)![0]
  command(native+`
$p=[PlanrailProcess]::new([int]$env:PLANRAIL_TEST_PID,$true);try{$expected=[IO.Path]::GetFullPath($env:PLANRAIL_TEST_TARGET);if(-not [String]::Equals($p.Path,$expected,[StringComparison]::OrdinalIgnoreCase) -or -not [String]::Equals([PlanrailProcess]::Canonical($expected),$expected,[StringComparison]::OrdinalIgnoreCase)){throw 'Unicode native process/final image paths do not match the exact installation'};$ownerDenied=$false;$timeDenied=$false;try{$p.StopLegacy($p.Path,'S-1-0-0',$p.Created)}catch{$ownerDenied=$_.Exception.InnerException -is [InvalidOperationException]};try{$p.StopLegacy($p.Path,$p.Owner,($p.Created+1))}catch{$timeDenied=$_.Exception.InnerException -is [InvalidOperationException]};if(-not $ownerDenied -or -not $timeDenied){throw 'Identity guard accepted mismatched owner or creation time'}}finally{$p.Dispose()}`,{PLANRAIL_TEST_PID:String(instance!.process().pid),PLANRAIL_TEST_TARGET:exe})
  expect(instance!.process().exitCode).toBeNull();cases.push('non-ACP native process/final image paths match exact installation; owner and creation-time mismatches rejected')
  // Denied image inspection must abort BEFORE replacement and keep the old process alive.
  restoreAcl=command('(Get-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET).Sddl',{PLANRAIL_ACL_TARGET:exe})
  const beforeHash=createHash('sha256').update(await readFile(exe)).digest('hex')
  command('$a=Get-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::ReadData,[Security.AccessControl.AccessControlType]::Deny);$a.AddAccessRule($rule);Set-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET -AclObject $a',{PLANRAIL_ACL_TARGET:exe})
  expect(interactive('Keep',true).exitCode).not.toBe(0);expect(instance!.process().exitCode).toBeNull()
  command('$a=Get-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET;$a.SetSecurityDescriptorSddlForm($env:PLANRAIL_ACL_SDDL);Set-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET -AclObject $a',{PLANRAIL_ACL_TARGET:exe,PLANRAIL_ACL_SDDL:restoreAcl});restoreAcl=undefined
  expect(createHash('sha256').update(await readFile(exe)).digest('hex')).toBe(beforeHash);cases.push('identity permission failure aborts before replacement')
  let closed=instance!.waitForEvent('close');const oldUi=interactive();await closed;instance=undefined
  expect(oldUi.initialChecked).toBe(true);expect(startup('Read')).toMatchObject({selected:true,registered:true,disabled:false});cases.push('actual pinned0.8.0 manually replaced, default checked')
  page=await launch(exe,['--planrail-autostart']);expect(await instance!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  expect(await waitExit(spawn(exe,['--planrail-autostart'],{env:envFor(),stdio:'ignore'}))).toBe(0);expect(await instance!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  expect(await waitExit(spawn(exe,[],{env:envFor(),stdio:'ignore'}))).toBe(0);await expect.poll(()=>instance!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
  expect((await snapshot()).projects.map(p=>p.name)).toEqual(['commit before manual install'])
  await page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await page.getByLabel('프로젝트 이름',{exact:true}).fill('discard current draft')
  closed=instance!.waitForEvent('close');expect(interactive().initialChecked).toBe(true);await closed;instance=undefined;cases.push('supported version graceful manual exit discards draft')
  command('$k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run");$k.SetValue("Planrail",[byte[]](3,0,0,0,0,0,0,0,0,0,0,0),[Microsoft.Win32.RegistryValueKind]::Binary);$k.Dispose()')
  await launch();expect(startup('Read').disabled).toBe(true);await close()
  expect(interactive().initialChecked).toBe(false);expect(startup('Read')).toMatchObject({selected:true,registered:true,disabled:true});cases.push('OS-disabled launch and interactive reinstall preserved')
  expect(startup('On')).toMatchObject({selected:true,registered:true,disabled:false})
  silent(installer,['--updated']);expect(startup('Read').registered).toBe(true)
  expect(startup('Off')).toMatchObject({selected:false,registered:false})
  silent(installer,['--updated']);expect(startup('Read')).toMatchObject({selected:false,registered:false})
  expect(interactive().initialChecked).toBe(false);expect(startup('Read')).toMatchObject({selected:false,registered:false});cases.push('explicit OFF and ON survive updated and interactive installs')
  await launch();expect((await snapshot()).projects.map(p=>p.name)).toEqual(['commit before manual install']);await close()
  const db=join(profile,'data/timeline.sqlite3'),dbHash=createHash('sha256').update(await readFile(db)).digest('hex')
  await uninstall();expect(startup('Read')).toMatchObject({selected:null,registered:false});expect(createHash('sha256').update(await readFile(db)).digest('hex')).toBe(dbHash)
  expect(interactive('Off').initialChecked).toBe(true);expect(startup('Read')).toMatchObject({selected:false,registered:false});await uninstall();cases.push('actual uninstall cleans registration, retains DB; fresh unchecked install persists OFF')
  evidence.pass=true
 }finally{
  if(restoreAcl)command('$a=Get-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET;$a.SetSecurityDescriptorSddlForm($env:PLANRAIL_ACL_SDDL);Set-Acl -LiteralPath $env:PLANRAIL_ACL_TARGET -AclObject $a',{PLANRAIL_ACL_TARGET:exe,PLANRAIL_ACL_SDDL:restoreAcl})
  await close();await writeFile(info.outputPath('startup-manual-installer-validation.json'),JSON.stringify(evidence,null,2)+'\n')
  // Only the fresh profile created in this disposable VM is removed.
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200})
 }
})
