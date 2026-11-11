import {test,expect} from '@playwright/test'
import {_electron,type ElectronApplication} from 'playwright'
import {execFileSync,spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {arch} from 'node:os'
test('actual updater waits for safe exit, installs per-user and automatically relaunches retained data',async({},info)=>{
 if(process.platform!=='win32'||arch()!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Fresh disposable GitHub Windows VM required')
 const appData=execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',"[Environment]::GetFolderPath('ApplicationData')"],{encoding:'utf8'}).trim(),profile=join(appData,'SimpleTimeline')
 if(existsSync(profile))throw Error('Refusing existing profile')
 const base=JSON.parse(await readFile('release/release-manifest.json','utf8')),next=JSON.parse(await readFile('artifacts/windows-update/release-manifest.json','utf8'))
 const installDir=join(process.env.RUNNER_TEMP!,'Planrail-real-updater-'+Date.now()),exe=join(installDir,'Planrail.exe'),harness=resolve('artifacts/packaged-harness/update.cjs'),handoff=info.outputPath('handoff.json')
 await mkdir(info.outputDir,{recursive:true});const installed=spawnSync(resolve('release',base.installer),['/S','/D='+installDir],{timeout:90000,encoding:'utf8'});expect(installed.status).toBe(0)
 let instance:ElectronApplication|null=null,launched=false
 const evidence:Record<string,unknown>={sourceSha:base.sourceSha,targetVersion:next.version,scope:'production adapter/loopback updater/cache/NSIS + real bootstrap shutdown; synthetic installer bypass confined to test harness',autoRelaunched:false}
 try{
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));delete env.ELECTRON_RUN_AS_NODE
  instance=await _electron.launch({chromiumSandbox:true,executablePath:exe,env,timeout:30000});const page=await instance.firstWindow()
  await page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await page.getByLabel('프로젝트 이름',{exact:true}).fill('업데이트 보존 확인');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.saving-shield')).toHaveCount(0)
  await instance.evaluate(async(_electron,{harness,directory,handoff})=>{await process.mainModule!.require(harness).prepare(directory,handoff)},{harness,directory:resolve('artifacts/windows-update'),handoff})
  await page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await page.getByLabel('프로젝트 이름',{exact:true}).fill('버리지 않는 초안')
  expect(await instance.evaluate((_electron,harness)=>process.mainModule!.require(harness).freeze(),harness)).toBe(false);await expect(page.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('버리지 않는 초안')
  await page.getByRole('button',{name:'편집 닫기',exact:true}).click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click()
  expect(await instance.evaluate((_electron,harness)=>process.mainModule!.require(harness).freeze(),harness)).toBe(true)
  const oldPid=instance.process().pid!,started=Date.now(),closed=instance.waitForEvent('close')
  await instance.evaluate((_electron,harness)=>process.mainModule!.require(harness).handoffAfterShutdown(),harness);await closed;instance=null
  await expect.poll(async()=>{try{const s=JSON.parse(await readFile(join(profile,'startup-latest.json'),'utf8'));return s.appVersion===next.version&&Date.parse(s.recordedAt)>=started&&s.renderer?.uiReady===true}catch{return false}},{timeout:60000}).toBe(true)
  launched=true;evidence.autoRelaunched=true;evidence.handoff=JSON.parse(await readFile(handoff,'utf8'));expect((evidence.handoff as any).shutdownCompletedBeforeHandoff).toBe(true)
  // Read-only SQLite from Node24, no application credentials or production mutation API.
  const retained=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare('SELECT name FROM projects ORDER BY id').all()));db.close()",join(profile,'data/timeline.sqlite3')],{encoding:'utf8'}))
  expect(retained).toEqual([{name:'업데이트 보존 확인'}]);evidence.retained=retained
  const processes=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe.replaceAll("'","''")}' } | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress`],{encoding:'utf8'}))
  expect([processes].flat().some(p=>p.ProcessId!==oldPid&&p.ExecutablePath.toLowerCase()===exe.toLowerCase())).toBe(true);evidence.processes=processes;evidence.pass=true
 }finally{
  await instance?.close().catch(()=>{});await writeFile(info.outputPath('real-updater-validation.json'),JSON.stringify(evidence,null,2)+'\n')
  // Auto-launched production app has no test inspector. Leave this fresh profile and
  // process to disposable VM teardown; do not force-kill it or delete an open DB.
  if(launched)console.log('Automatic relaunch left running for disposable VM teardown.')
 }
})
