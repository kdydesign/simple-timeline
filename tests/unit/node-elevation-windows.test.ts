import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createElevationCommand, readElevatedExit } from '../../src/main/node-management/windows'

function worker() {
  const args = createElevationCommand('C:\\Windows\\System32', {
    executable: 'C:\\nvm\\nvm.exe', executableDigest: 'a'.repeat(64),
    args: ['install', '24.22.3', '64'], nvmHome: 'C:\\nvm', nvmSymlink: 'C:\\nodejs', settingsDigest: 'b'.repeat(64),
  })
  const outer = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
  return Buffer.from(outer.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)![1], 'base64').toString('utf16le')
}

it('keeps settings, shell policy, and file staging errors distinct from a changed executable', () => {
  const script = worker()
  const stages = { 1620: 'nvm-settings-check', 1621: 'command-processor-check', 1622: 'command-autorun', 1623: 'nvm-staging-failed' }
  for (const [code, status] of Object.entries(stages)) {
    expect(script).toContain(code)
    expect(readElevatedExit('WORKRAIL_EXIT:' + code, 0)).toEqual({ status })
    expect(readElevatedExit('WORKRAIL_EXIT:' + code, 0, true)).toEqual({ status: 'failed' })
  }
  expect(readElevatedExit('WORKRAIL_EXIT:1610', 0)).toEqual({ status: 'integrity-failed' })
})

it.skipIf(process.platform !== 'win32')('accepts missing or empty AutoRun and blocks a configured command in either hive', () => {
  const script = worker()
  const guard = script.slice(script.indexOf('$failure = 1621'), script.indexOf('$failure = 1623'))
  expect(guard).toContain('AutoRun')
  const parent = 'Software\\WorkRailNodeTest-' + randomUUID()
  const fixture = guard.replace('HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor', 'HKEY_CURRENT_USER\\' + parent + '\\User')
    .replace('HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Command Processor', 'HKEY_CURRENT_USER\\' + parent + '\\Machine')
  // Exercise the emitted guard on disposable HKCU subkeys. Never touch either real cmd key.
  const check = fixture.replace('exit 1622', "return 'blocked'")
  const ps = `
$ErrorActionPreference = 'Stop'
function Check { ${check}; return 'ok' }
$root = [Microsoft.Win32.Registry]::CurrentUser
try {
  Check
  $userKey = $root.CreateSubKey('${parent}\\User')
  $machineKey = $root.CreateSubKey('${parent}\\Machine')
  Check
  $userKey.SetValue('AutoRun', '')
  Check
  $userKey.SetValue('AutoRun', 'example')
  Check
  $userKey.DeleteValue('AutoRun')
  $machineKey.SetValue('AutoRun', 'example')
  Check
} finally {
  if ($userKey) { $userKey.Close() }
  if ($machineKey) { $machineKey.Close() }
  $root.DeleteSubKeyTree('${parent}', $false)
}`
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  expect(output.trim().split(/\r?\n/)).toEqual(['ok', 'ok', 'ok', 'blocked', 'blocked'])
}, 20_000)
