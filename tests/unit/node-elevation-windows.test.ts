import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createElevationCommand, readElevatedExit } from '../../src/main/node-management/windows'

function worker(legacyHelperRoot?: string) {
  const args = createElevationCommand('C:\\Windows\\System32', {
    executable: 'C:\\nvm\\nvm.exe', executableDigest: 'a'.repeat(64),
    legacyHelperRoot, args: [legacyHelperRoot ? 'use' : 'install', '24.22.3', '64'], nvmHome: 'C:\\nvm', nvmSymlink: 'C:\\nodejs', settingsDigest: 'b'.repeat(64),
  })
  const outer = args.includes('-Command') ? args.at(-1)! : Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
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

it.skipIf(process.platform !== 'win32')('keeps a failed direct link command from starting the 1.1.11 fallback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workrail-nvm-lock-'))
  const script = worker(directory)
  const verifier = script.slice(script.indexOf('function Open-VerifiedFile'), script.indexOf('$launching = $false'))
  const locks = script.slice(script.indexOf('$stream = Open-VerifiedFile'), script.indexOf('$failure = 1623'))
  const batch = '@echo HELPER_READ\r\n'
  const vbs = 'Rem nvm fallback fixture\r\n'
  const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
  // Exercise the emitted lock acquisition on disposable files with known bytes.
  const fixture = locks.replace('792d6a485d26b3ae1c926d1d4915e5eaf9a40113afd623212d1a9591e56bb1d5', digest(batch))
    .replace('3219b67d6c49d02b832026d13ece959c85d64690326d6b3f10923790c8a5f130', digest(vbs))
  const command = join(directory, 'elevate.cmd').replaceAll("'", "''")
  try {
    writeFileSync(join(directory, 'elevate.cmd'), batch)
    writeFileSync(join(directory, 'elevate.vbs'), vbs)
    const check = `
$ErrorActionPreference = 'Stop'
${verifier}
function Run-Fallback {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = [IO.Path]::Combine([Environment]::SystemDirectory, 'cmd.exe')
  $start.Arguments = '/d /s /c ""${command}""'
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $child = [Diagnostics.Process]::Start($start)
  $output = $child.StandardOutput.ReadToEnd()
  $child.WaitForExit()
  $child.Dispose()
  return $output.Contains('HELPER_READ')
}
$helpers = @()
try {
  ${fixture}
  $cmd = [IO.Path]::Combine([Environment]::SystemDirectory, 'cmd.exe')
  & $cmd /d /c exit 1
  if ($LASTEXITCODE -ne 0) { Run-Fallback }
} finally { foreach ($stream in $helpers) { $stream.Dispose() } }
Run-Fallback
`
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(check, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    expect(output.trim().split(/\r?\n/)).toEqual(['False', 'True'])
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 20_000)
