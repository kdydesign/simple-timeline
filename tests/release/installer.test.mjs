import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const {load}=require('js-yaml')
test('per-user assisted installer exposes checked launch without deleting data',()=>{
  const c=load(readFileSync('electron-builder.yml','utf8'))
  assert.equal(c.nsis.oneClick,false)
  assert.equal(c.nsis.runAfterFinish,true)
  assert.equal(c.nsis.perMachine,false)
  assert.equal(c.nsis.allowElevation,false)
  assert.equal(c.nsis.deleteAppDataOnUninstall,false)
  assert.equal(c.win.requestedExecutionLevel,'asInvoker')
})
test('installer configuration conforms to the installed builder schema',async()=>{
  const {validateConfiguration}=require('app-builder-lib/out/util/config/config.js')
  await validateConfiguration(load(readFileSync('electron-builder.yml','utf8')),{add(){}})
})
test('the selected B icon is configured for the app and both installer actions',()=>{
  const c=load(readFileSync('electron-builder.yml','utf8'))
  assert.equal(c.win.icon,'resources/icon.ico')
  assert.ok(c.files.includes('resources/icon.png'), 'package the window icon referenced by main')
  assert.equal(c.nsis.installerIcon,c.win.icon)
  assert.equal(c.nsis.uninstallerIcon,c.win.icon)
  const ico=readFileSync(c.win.icon)
  assert.equal(ico.readUInt16LE(2),1)
  assert.equal(ico.readUInt16LE(4),6)
  const png=readFileSync('resources/icon.png')
  assert.equal(png.subarray(1,4).toString(),'PNG')
})
