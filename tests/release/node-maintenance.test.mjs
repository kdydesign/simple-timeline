import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareMaintenance } from '../../src/main/node-maintenance/runtime.ts'

test('production and test builds include an independent recovery entry and sandbox preload',()=>{
 const config=readFileSync('electron.vite.config.mts','utf8')
 assert.match(config, /'node-maintenance':\s*resolve\('src\/main\/node-maintenance\/main\.ts'\)/)
 assert.match(config, /'node-maintenance':\s*resolve\('src\/preload\/node-maintenance\.ts'\)/)
 assert.match(config, /maintenance-ui/)
 assert.match(readFileSync('electron.vite.test.config.mts','utf8'), /'node-maintenance'/)
})
test('recovery boots with local files, restricted renderer permissions and no PlanRail service bootstrap',()=>{
 const entry=readFileSync('src/main/node-maintenance/main.ts','utf8')
 assert.match(entry,/sandbox:\s*true/)
 assert.match(entry,/contextIsolation:\s*true/)
 assert.match(entry,/nodeIntegration:\s*false/)
 assert.match(entry,/requestSingleInstanceLock/)
 assert.match(entry,/verifyMaintenance/)
 assert.doesNotMatch(entry,/from ['"].*(?:bootstrap|\/db\/|\/sharing\/|\/updates\/)/)
 const html=readFileSync('src/renderer/node-maintenance/index.html','utf8')
 assert.match(html,/default-src 'none'/)
 assert.doesNotMatch(html,/localhost|127\.0\.0\.1|https?:\/\//)
})
test('built recovery entry is present when the application has been built',()=>{
 if(!existsSync('out/main/index.cjs')) return
 for(const name of ['out/main/node-maintenance.cjs','out/main/maintenance-ui/index.html','out/main/maintenance-ui/app.js','out/preload/node-maintenance.cjs']) assert.ok(existsSync(name),`Missing recovery artifact: ${name}`)
})

test('built maintenance graph can be staged without any project node_modules dependencies',async()=>{
 if(!existsSync('out/main/index.cjs')) return
 const directory=await mkdtemp(join(tmpdir(),'workrail-recovery-release-'))
 try {
  const runtimeDirectory=join(directory,'runtime')
  await mkdir(runtimeDirectory)
  await writeFile(join(runtimeDirectory,'electron.exe'),'fixture: no Windows executable is run')
  const prepared=await prepareMaintenance({runtimeDirectory,buildDirectory:resolve('out'),maintenanceRoot:join(directory,'recovery'),version:'1.0.0'})
  assert.ok(existsSync(prepared.executable))
  assert.ok(!existsSync(join(prepared.appDirectory,'main','index.cjs')))
  const preload=readFileSync(join(prepared.appDirectory,'preload','node-maintenance.cjs'),'utf8')
  for(const match of preload.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g)) assert.equal(match[1],'electron','Sandbox recovery preload must be self-contained')
 }finally{await rm(directory,{recursive:true,force:true})}
})
