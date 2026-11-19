import { execFile, type ExecFileOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, open, readdir, readlink, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { isNodeVersion } from '../../shared/node-management'
import { fetchBoundedAsset, type NodeFetch } from './catalog'
import { discoverWindowsNode, getDownloadProxy, isSafeNvmPath, type NvmInstallation } from './discovery'
import { parseModernList, readClassicList } from './classic-list'
import { verifyClassicRelease } from './official-classic'
import { allowedNodeSigner, nodeSignatureCheck } from './node-signing'
import { downloadNodeZip, NodeZipDownloadError } from './zip-download'
import { IncompleteNodeInstallationError, installVerifiedNodeZip, inspectNodeZipInstallation, prepareNodeZipRoot } from './zip-install'
import { knownClassicVersion, legacyHelpers, modernReleases } from './manager-support'
import { isExplorerComponent, samePath } from './windows-probe'
import { registryJson } from './registry-json'
import { modernRegistryRead } from './modern-manager'
import { createMachineMutationLock } from './mutation-lock'
import { fetchOfficialNodeDigest, fetchOfficialMsiDigest, readMsiResult, type MsiEvidence } from './standalone'
import { createOfficialMsiProofScript, createMsiRemovalCommand, createMsiRemovalWorker, MACHINE_LOCK_CONTEXT_SCRIPT, MSI_INSPECTION_SCRIPT } from './standalone-windows'
import type { ElevatedResult, WindowsNodeAdapter } from './service'

export const NVM_INSTALLER_URL = 'https://github.com/nvm-windows/nvm/releases/download/1.2.2/nvm-setup.exe'
const NVM_INSTALLER_SHA256 = '2d5ad523aa6182205da77c0eb8210638aaa8792f4e6a4bc12e1ac854c5455a68'
const MAX_INSTALLER_BYTES = 12 * 1024 * 1024
const GITHUB_ASSET_ORIGINS = new Set(['https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com'])
const executeFile = promisify(execFile)
function exec(executable: string, args: string[], options: ExecFileOptions) {
  const run = executeFile(executable, args, { ...options, encoding: 'utf8' })
  // Every invocation supplies its complete command line and accepts no host input.
  // Signal EOF rather than leave an open pipe for the noninteractive console host.
  run.child.stdin?.end()
  return run
}

type ElevationInvocation = { executable: string; executableDigest: string } & (
  | { args: ['use', string, '64']; legacyHelperRoot?: string; nvmHome: string; nvmSymlink: string; settingsDigest: string }
  | { args: [] }
)

function validateInstallation(installation: NvmInstallation, command: 'install' | 'use' | 'list', version?: string) {
  for (const path of [installation.exe, installation.home, installation.root, installation.symlink]) {
    if (!isSafeNvmPath(path)) throw Error('Invalid nvm path')
  }
  if (win32.join(installation.home, 'nvm.exe').toLowerCase() !== installation.exe.toLowerCase()
    || (command !== 'list' && !isNodeVersion(version)) || !/^[a-f0-9]{64}$/.test(installation.settingsDigest)) throw Error('Invalid nvm command')
}

export function buildNvmInvocation(installation: NvmInstallation, command: 'use', version: string): ElevationInvocation {
  validateInstallation(installation, command, version)
  if (installation.family !== 'classic' || command !== 'use' || knownClassicVersion(installation.executableDigest) !== installation.version) throw Error('Unverified classic nvm')
  return {
    executable: installation.exe, executableDigest: installation.executableDigest,
    ...(installation.version !== '1.2.2' ? { legacyHelperRoot: installation.root } : {}),
    args: [command, version, '64'], nvmHome: installation.home, nvmSymlink: installation.symlink,
    settingsDigest: installation.settingsDigest,
  }
}

const psLiteral = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const psArgs = (script: string): string[] => [
  '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
]

const powershellPath = (system: string) => win32.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')

const verifiedFileFunction = `
function Open-VerifiedFile($path, $expected, $sharing = [IO.FileShare]::Read) {
  $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, $sharing)
  try {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
    if ($digest -ne $expected) { $stream.Dispose(); return $null }
    $stream.Position = 0
    return $stream
  } catch {
    $stream.Dispose()
    throw
  }
}
`

function lockHelpers(root: string, files: Record<string, string>, onFailure: string, exclusive = false) {
  return Object.entries(files).map(([relative, digest]) => `
$stream = Open-VerifiedFile ${psLiteral(win32.join(root, relative))} ${psLiteral(digest)}${exclusive ? ' ([IO.FileShare]::None)' : ''}
if ($null -eq $stream) { ${onFailure} }
$helpers += $stream`).join('\n')
}

export function createElevationCommand(system: string, invocation: ElevationInvocation): string[] {
  let command = `
$launching = $true
$child = Start-Process -FilePath ${psLiteral(invocation.executable)} -WorkingDirectory ${psLiteral(system)} -PassThru -Wait
if ($null -eq $child.ExitCode) { exit 1611 }
exit $child.ExitCode
`
  if ('nvmHome' in invocation) {
    const [action, version, arch] = invocation.args
    // nvm 1.x launches cmd and may look for node on PATH. Do not carry the
    // renderer process's user PATH, current directory, or Node configuration
    // into an elevated command. cmd AutoRun is also checked under that account.
    command = `
$failure = 1620
$settings = Open-VerifiedFile ${psLiteral(win32.join(invocation.nvmHome, 'settings.txt'))} ${psLiteral(invocation.settingsDigest)}
if ($null -eq $settings) { exit $failure }
$env:NoDefaultCurrentDirectoryInExePath = '1'
$env:NODE_OPTIONS = $null
$env:NODE_PATH = $null
$env:NVM_HOME = ${psLiteral(invocation.nvmHome)}
$env:NVM_SYMLINK = ${psLiteral(invocation.nvmSymlink)}
$failure = 1621
foreach ($key in @('HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor', 'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Command Processor')) {
  $autoRun = [Microsoft.Win32.Registry]::GetValue($key, 'AutoRun', $null)
  if ($null -ne $autoRun -and !($autoRun -is [string] -and $autoRun.Length -eq 0)) { exit 1622 }
}
# 1.1.11 may start wscript asynchronously on a direct link failure.
# Deny all access to both legacy helpers until the synchronous CLI exits.
$failure = 1610
${invocation.legacyHelperRoot ? lockHelpers(invocation.legacyHelperRoot, legacyHelpers, 'exit 1610', true) : ''}
$failure = 1623
$stage = [IO.Path]::Combine([IO.Path]::GetTempPath(), ('workrail-nvm-run-' + [Guid]::NewGuid().ToString('N')))
[void][IO.Directory]::CreateDirectory($stage)
$stagedExe = [IO.Path]::Combine($stage, 'nvm.exe')
$writer = [IO.File]::Open($stagedExe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $source.CopyTo($writer) } finally { $writer.Dispose() }
$verifiedExe = Open-VerifiedFile $stagedExe ${psLiteral(invocation.executableDigest)}
if ($null -eq $verifiedExe) { exit 1610 }
# nvm can run an adjacent elevate.cmd when cmd fails. Control that fallback.
$fallbackPath = [IO.Path]::Combine($stage, 'elevate.cmd')
$fallback = [IO.File]::Open($fallbackPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
$fallbackBytes = [Text.Encoding]::ASCII.GetBytes('@exit /b 1' + [char]13 + [char]10)
$fallback.Write($fallbackBytes, 0, $fallbackBytes.Length)
$fallback.Flush()
$launching = $true
& $stagedExe ${psLiteral(action)} ${psLiteral(version)} ${psLiteral(arch)}
$launching = $false
exit $LASTEXITCODE
`
  }
  const worker = `
$ErrorActionPreference = 'Stop'
${verifiedFileFunction}
$launching = $false
$failure = 1610
$helpers = @()
try {
  if ([Environment]::SystemDirectory -ine ${psLiteral(system)}) { exit 1610 }
  $env:SystemRoot = ${psLiteral(win32.dirname(system))}
  $env:windir = $env:SystemRoot
  $env:Path = ${psLiteral(system)}
  $env:ComSpec = ${psLiteral(win32.join(system, 'cmd.exe'))}
  $env:PSModulePath = ${psLiteral(win32.join(win32.dirname(powershellPath(system)), 'Modules'))}
  Set-Location -LiteralPath ${psLiteral(system)}
  $source = Open-VerifiedFile ${psLiteral(invocation.executable)} ${psLiteral(invocation.executableDigest)}
  if ($null -eq $source) { exit 1610 }
  ${command}
} catch {
  if ($launching) { exit 1611 }
  exit $failure
} finally {
  foreach ($stream in (@($fallback, $verifiedExe, $settings, $source) + $helpers)) {
    if ($null -ne $stream) { $stream.Dispose() }
  }
  if ($stage -and !$launching) {
    try { [IO.Directory]::Delete($stage, $true) } catch { }
  }
}
`
  const argumentsOption = psLiteral(psArgs(worker).join(' '))
  const launcher = `
$ErrorActionPreference = 'Stop'
try {
  if ([Environment]::SystemDirectory -ine ${psLiteral(system)}) { [Console]::WriteLine('WORKRAIL_EXIT:1610'); exit 0 }
  $child = Start-Process -FilePath ${psLiteral(powershellPath(system))} -WorkingDirectory ${psLiteral(system)} -Verb RunAs -ArgumentList ${argumentsOption} -WindowStyle Hidden -PassThru -Wait
  if ($null -eq $child.ExitCode) { exit 1 }
  [Console]::WriteLine('WORKRAIL_EXIT:' + $child.ExitCode)
} catch {
  $exception = $_.Exception
  while ($exception) {
    if ($exception -is [ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 1223) {
      [Console]::WriteLine('WORKRAIL_ELEVATION_CANCELLED')
      exit 0
    }
    $exception = $exception.InnerException
  }
  exit 1
}
`
  const encoded = psArgs(launcher)
  // Double UTF-16 base64 encoding can exceed CreateProcess's 32K command line
  // for long install paths. The outer launcher contains just the system path
  // and the encoded worker, and is passed as a single execFile argument.
  return encoded.at(-1)!.length < 30_000 ? encoded : ['-NoProfile', '-NonInteractive', '-Command', launcher]
}

function modernCommand(installation: Extract<NvmInstallation, { family: 'modern' }>, action: 'list' | 'use', version?: string) {
  validateInstallation(installation, action, version)
  const release = modernReleases.find(candidate => candidate.digest === installation.executableDigest && candidate.version === installation.version)
  if (!release) throw Error('Unverified modern nvm')
  // The plain installed table is local. The JSON variant queries the release catalog.
  const execution = action === 'list' ? `
  $rows = & ${psLiteral(installation.exe)} 'list' 'installed'
  if ($LASTEXITCODE -eq 0) { $rows | ForEach-Object { [Console]::WriteLine($_) } }
  exit $LASTEXITCODE` : `
  $child = Start-Process -FilePath ${psLiteral(installation.exe)} -WorkingDirectory ([Environment]::SystemDirectory) -ArgumentList @('use', ${psLiteral(version!)}, '--no-install') -Wait -PassThru -WindowStyle Hidden
  if ($null -eq $child.ExitCode) { throw 'Unknown completion' }
  $failure = if ($child.ExitCode -eq 0) { 0 } else { 1 }`
  return psArgs(`
$ErrorActionPreference = 'Stop'
${verifiedFileFunction}
$helpers = @()
$failure = 1610
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'User context required' }
  ${lockHelpers(installation.home, { 'nvm.exe': release.digest, ...release.helpers }, "throw 'Unverified file'")}
  $failure = 1620
  ${modernRegistryRead}
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $actual = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($snapshot))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
  if ($actual -ne ${psLiteral(installation.settingsDigest)}) { throw 'Registry preferences changed' }
  $env:LOCALAPPDATA = [Environment]::GetFolderPath('LocalApplicationData')
  $env:APPDATA = [Environment]::GetFolderPath('ApplicationData')
  $env:USERPROFILE = [Environment]::GetFolderPath('UserProfile')
  $env:TEMP = [IO.Path]::Combine($env:LOCALAPPDATA, 'Temp')
  $env:TMP = $env:TEMP
  $env:NVM_HOME = ${psLiteral(installation.home)}
  $env:NoDefaultCurrentDirectoryInExePath = '1'
  $failure = 1611
  ${execution}
} catch { } finally {
  foreach ($stream in $helpers) { $stream.Dispose() }
}
[Console]::WriteLine('WORKRAIL_EXIT:' + $failure)
`)
}

export function readElevatedExit(stdout: string, wrapperExit: number, installer = false): ElevatedResult {
  if (wrapperExit !== 0) return { status: 'unknown' }
  const result = stdout.trim()
  if (result === 'WORKRAIL_ELEVATION_CANCELLED') return { status: 'cancelled' }
  const code = /^WORKRAIL_EXIT:(-?\d+)$/.exec(result)?.[1]
  if (code === undefined) return { status: 'unknown' }
  if (code === '1610') return { status: 'integrity-failed' }
  if (code === '1611') return { status: 'unknown' }
  if (!installer) {
    if (code === '1620') return { status: 'nvm-settings-check' }
    if (code === '1621') return { status: 'command-processor-check' }
    if (code === '1622') return { status: 'command-autorun' }
    if (code === '1623') return { status: 'nvm-staging-failed' }
  }
  if (installer && ['2', '5'].includes(code)) return { status: 'cancelled' }
  return { status: code === '0' ? 'success' : 'failed' }
}

const registryEnvironmentScript = `
$ErrorActionPreference = 'Stop'
${registryJson}
function Read-WorkRailEnvironment($key) {
  $values = @{}
  if ($null -ne $key) {
    foreach ($name in $key.GetValueNames()) {
      $value = $key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if ($value -is [string]) { $values[$name] = $value }
    }
    $key.Dispose()
  }
  return $values
}
$machine = Read-WorkRailEnvironment ([Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'))
$user = Read-WorkRailEnvironment ([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment'))
[Console]::WriteLine($serializer.Serialize(@{ machine = $machine; user = $user }))
`

export function mergeWindowsEnvironment(machine: Record<string, string>, user: Record<string, string>, inherited: NodeJS.ProcessEnv) {
  const byName = (values: Record<string, string | undefined>) => new Map(Object.entries(values).map(([key, value]) => [key.toUpperCase(), value]))
  const system = byName(machine)
  const account = byName(user)
  const lookup = new Map([...byName(inherited), ...system, ...account])
  for (const key of ['NVM_HOME', 'NVM_SYMLINK']) {
    if (!system.has(key) && !account.has(key)) lookup.delete(key)
  }
  const expand = (value: string) => {
    for (let depth = 0; depth < 5; depth++) {
      const next = value.replace(/%([^%]+)%/g, (match, name: string) => lookup.get(name.toUpperCase()) ?? match)
      if (next === value) break
      value = next
    }
    return value
  }
  const path = [system.get('PATH'), account.get('PATH')].filter(Boolean).join(';')
  const pathext = lookup.get('PATHEXT')
  return {
    Path: expand(path || inherited.Path || inherited.PATH || ''),
    NVM_HOME: expand(lookup.get('NVM_HOME') ?? ''),
    NVM_SYMLINK: expand(lookup.get('NVM_SYMLINK') ?? ''),
    ...(pathext ? { PATHEXT: expand(pathext) } : {}),
  }
}

async function isX64Node(path: string) {
  const file = await open(path, 'r')
  try {
    const dos = Buffer.alloc(64)
    if ((await file.read(dos, 0, dos.length, 0)).bytesRead !== dos.length || dos.readUInt16LE(0) !== 0x5a4d) return false
    const peOffset = dos.readUInt32LE(0x3c)
    if (peOffset < dos.length || peOffset > 1024 * 1024) return false
    const pe = Buffer.alloc(6)
    return (await file.read(pe, 0, pe.length, peOffset)).bytesRead === pe.length
      && pe.readUInt32LE(0) === 0x4550 && pe.readUInt16LE(4) === 0x8664
  } finally {
    await file.close()
  }
}

async function readBoundedFile(path: string, maxBytes: number) {
  const handle = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(Math.min((await handle.stat()).size, maxBytes) + 1)
    const { bytesRead } = await handle.read({ buffer: bytes })
    if (bytesRead === bytes.length) throw Error('Unexpected file size')
    return bytes.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

// Open the kernel's SystemRoot link without running a helper or consulting a
// DOS drive or environment variable. Native realpath returns the final DOS
// path for the handle. Check the drive path identifies that same directory.
const kernelSystemDirectory = String.raw`\\?\GLOBALROOT\SystemRoot\System32`

export async function resolveSystemPowerShell() {
  const system = await realpath(kernelSystemDirectory)
  if (!isSafeNvmPath(system) || win32.normalize(system) !== system || win32.basename(system).toLowerCase() !== 'system32') {
    throw Error('Invalid Windows system directory')
  }
  const [kernel, local] = await Promise.all([
    stat(kernelSystemDirectory, { bigint: true }), stat(system, { bigint: true }),
  ])
  if (!kernel.isDirectory() || !local.isDirectory() || !kernel.ino || kernel.ino !== local.ino || kernel.dev !== local.dev) {
    throw Error('Windows system directory identity mismatch')
  }
  const root = win32.dirname(system)
  const powershell = powershellPath(system)
  const options = {
    cwd: system, windowsHide: true, shell: false as const, maxBuffer: 512 * 1024,
    env: {
      SystemRoot: root, windir: root, SystemDrive: win32.parse(root).root.slice(0, 2),
      Path: system, ComSpec: win32.join(system, 'cmd.exe'),
      PSModulePath: win32.join(win32.dirname(powershell), 'Modules'),
    },
  }
  return { system, powershell, options }
}

export function createWindowsNodeAdapter(request: NodeFetch, zipTransport?: (proxy?: string) => Promise<NodeFetch>): WindowsNodeAdapter {
  const verifiedClassic = new Map<string, string>()
  const officialDigests = new Map<string, string>()
  const officialPackages = new Set<string>()
  let machineLock: Promise<ReturnType<typeof createMachineMutationLock>> | null = null
  function lock() {
    machineLock ??= (async () => {
      const context = JSON.parse(await runPowerShell(MACHINE_LOCK_CONTEXT_SCRIPT.replace('__OWNER_PID__', String(process.pid))))
      if (!isSafeNvmPath(context.directory) || typeof context.boot !== 'string' || !/^\d{10,20}$/.test(context.boot)) throw Error('Invalid machine mutation context')
      return createMachineMutationLock(context.directory, context.boot, { startedAt: context.ownerStartedAt, userSid: context.userSid })
    })().catch(error => { machineLock = null; throw error })
    return machineLock
  }

  async function verifiedClassicList(installation: NvmInstallation, system: string) {
    return readClassicList(installation, system, readBoundedFile,
      knownClassicVersion(installation.executableDigest) ?? verifiedClassic.get(installation.executableDigest))
  }

  async function runPowerShell(script: string, timeout = 8_000) {
    const { powershell, options } = await resolveSystemPowerShell()
    return (await exec(powershell, psArgs(script), { ...options, timeout })).stdout.trim()
  }

  async function checkModernStorage(path: string) {
    // Match nvm's writable-group ACL check without modifying any permissions.
    // Include Everyone in addition to Authenticated Users and the local Users group.
    const verdict = await runPowerShell(`
$ErrorActionPreference = 'Stop'
$dir = [IO.DirectoryInfo]::new(${psLiteral(path)})
if (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }
$acl = $dir.GetAccessControl()
$descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
if ($null -eq $descriptor.DiscretionaryAcl) { exit 1 }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -in @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545') -and
      ([int64]$rule.FileSystemRights -band 0x500d0156) -ne 0) { exit 1 }
}
[Console]::WriteLine('VERIFIED')`).catch(() => '')
    if (verdict !== 'VERIFIED') throw Error('zip-permission')
  }

  async function elevate(invocation: ElevationInvocation) {
    let shell: Awaited<ReturnType<typeof resolveSystemPowerShell>>
    try {
      shell = await resolveSystemPowerShell()
    } catch {
      return { status: 'integrity-failed' } as const
    }
    try {
      // Start-Process -Wait tracks process completion through the UAC bridge.
      // Killing this bridge at a timeout would lose the elevated process handle.
      const { stdout } = await exec(shell.powershell, createElevationCommand(shell.system, invocation), shell.options)
      return readElevatedExit(stdout, 0, !('nvmHome' in invocation))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return { status: 'failed' } as const
      return { status: 'unknown' } as const
    }
  }

  async function managerVersions(installation: NvmInstallation) {
    const shell = await resolveSystemPowerShell()
    if (installation.family === 'classic') return verifiedClassicList(installation, shell.system)
    const args = modernCommand(installation, 'list')
    const { stdout } = await exec(shell.powershell, args, { ...shell.options, timeout: 30_000 })
    return parseModernList(stdout)
  }

  return {
    managerVersions,
    recognizesVersion: async (installation, version) => (await managerVersions(installation))?.includes(version) === true,
    async verifiedDirectory(root) {
      return isSafeNvmPath(root) && win32.normalize(root).replace(/\\$/, '').slice(3).split('\\').every(isExplorerComponent)
        && (await lstat(root)).isDirectory() && samePath(root, await realpath(root))
    },
    acquireMutation: async kind => (await lock()).acquire(kind),
    mutationStatus: async () => (await lock()).status(),
    async inspectStandalone() {
      const evidence: MsiEvidence[] = JSON.parse(await runPowerShell(MSI_INSPECTION_SCRIPT, 30_000))
      if (!Array.isArray(evidence) || evidence.length > 64) throw Error('Invalid MSI evidence')
      for (const candidate of evidence) {
        if (!isNodeVersion(candidate.version)) continue
        try {
          let digest = officialDigests.get(candidate.version)
          if (!digest) {
            digest = await fetchOfficialNodeDigest(request, candidate.version)
            officialDigests.set(candidate.version, digest)
          }
          candidate.officialNodeDigest = digest
          const proofIdentity = [candidate.productCode, candidate.packageCode, candidate.componentId, candidate.packageDigest, candidate.version].join('|')
          if (!candidate.packageSignature && candidate.protectedLocation && candidate.nodeSignature && candidate.nodeDigest === digest) {
            if (!officialPackages.has(proofIdentity)) {
              const expected = await fetchOfficialMsiDigest(request, candidate.version)
              const bytes = await fetchBoundedAsset(request, 'https://nodejs.org/dist/v' + candidate.version + '/node-v' + candidate.version + '-x64.msi', new Set(['https://nodejs.org']), 128 * 1024 * 1024)
              if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('Untrusted original MSI')
              const directory = await mkdtemp(win32.join(tmpdir(), 'workrail-official-msi-'))
              try {
                const path = win32.join(directory, 'original.msi')
                await writeFile(path, bytes, { flag: 'wx' })
                if (await runPowerShell(createOfficialMsiProofScript(path, expected, candidate), 30_000) !== 'VERIFIED') throw Error('Official MSI correspondence failed')
                officialPackages.add(proofIdentity)
              } finally { await rm(directory, { recursive: true, force: true }).catch(() => {}) }
            }
            candidate.packageSourceVerified = true
          }
        } catch { candidate.officialNodeDigest = '' }
      }
      return evidence
    },
    async removeStandalone(target) {
      let directory: string | undefined
      let result: ReturnType<typeof readMsiResult> = { status: 'unknown', msiExitCode: null }
      try {
        const shell = await resolveSystemPowerShell()
        directory = await mkdtemp(win32.join(tmpdir(), 'workrail-node-removal-'))
        const workerPath = win32.join(directory, 'verified-worker.ps1')
        const worker = createMsiRemovalWorker(shell.system, target)
        await writeFile(workerPath, worker, { flag: 'wx' })
        const digest = createHash('sha256').update(worker).digest('hex')
        // No timeout: losing the UAC bridge does not establish MSI completion.
        const { stdout } = await exec(shell.powershell, createMsiRemovalCommand(shell.system, workerPath, digest), shell.options)
        result = readMsiResult(stdout.trim())
      } catch { /* Unknown completion retains the persistent machine reservation. */ }
      finally { if (directory && result.status !== 'unknown') await rm(directory, { recursive: true, force: true }).catch(() => {}) }
      return result
    },
    discover: () => discoverWindowsNode({
      readModernSettings: () => runPowerShell(`
$ErrorActionPreference = 'Stop'
${modernRegistryRead}
[Console]::WriteLine($snapshot)`),
      async readEnvironment() {
        const data = JSON.parse(await runPowerShell(registryEnvironmentScript))
        return mergeWindowsEnvironment(data.machine, data.user, process.env)
      },
      async pathKind(path) {
        const item = await lstat(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
          throw error
        })
        if (!item) return 'missing'
        if (item.isSymbolicLink()) return 'symlink'
        if (item.isFile()) return 'file'
        if (item.isDirectory()) return 'directory'
        return 'other'
      },
      completeNodePackage: async (root, version) => await inspectNodeZipInstallation(root, version) === 'complete',
      resolvePath: realpath,
      readLink: readlink,
      listDirectories: async path => (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name),
      readSettings: path => readBoundedFile(path, 64 * 1024),
      async verifyClassicRelease(path, digest) {
        const cached = verifiedClassic.get(digest)
        if (cached) return cached
        const bytes = await readBoundedFile(path, 32 * 1024 * 1024)
        if (createHash('sha256').update(bytes).digest('hex') !== digest) return null
        const version = await verifyClassicRelease(request, bytes).catch(() => null)
        if (version) verifiedClassic.set(digest, version)
        return version
      },
      getManagerDigest: async path => createHash('sha256').update(await readBoundedFile(path, 32 * 1024 * 1024)).digest('hex'),
      async getNodeVersion(path) {
        if (!/\\node(?:64)?\.exe$/i.test(path)) return null
        // File metadata is sufficient for a diagnostic and avoids executing a
        // PATH-selected standalone program just to learn its version.
        const version = await runPowerShell(`[Console]::WriteLine([Diagnostics.FileVersionInfo]::GetVersionInfo(${psLiteral(path)}).ProductVersion)`)
        return /^v?(\d+\.\d+\.\d+)(?:\.0)?$/.exec(version)?.[1] ?? null
      },
      isX64Node,
    }),
    async changeVersion(installation, command, version, phase = () => {}) {
      if (command === 'install') {
        const validate = async () => {
          const current = await this.discover().catch(() => { throw Error('nvm-settings-check') })
          const fresh = current.installation
          if (!current.capabilities?.install.available || !fresh || fresh.family !== installation.family
            || fresh.executableDigest !== installation.executableDigest || fresh.settingsDigest !== installation.settingsDigest
            || !samePath(fresh.exe, installation.exe) || !samePath(fresh.root, installation.root)
            || !samePath(fresh.symlink, installation.symlink)) throw Error('nvm-settings-check')
          return current
        }
        try {
          validateInstallation(installation, command, version)
          const discovered = await validate()
          if (installation.family === 'classic' && !knownClassicVersion(installation.executableDigest)) {
            const { system } = await resolveSystemPowerShell()
            const listed = await verifiedClassicList(installation, system).catch(() => null)
            if (!listed || !discovered.installedVersions.every(installed => listed.includes(installed))) return { status: 'nvm-list-unsupported' }
          }
          await prepareNodeZipRoot(installation.root, version, installation.family === 'modern')
          if (installation.family === 'modern') await checkModernStorage(installation.root)
          const existing = await inspectNodeZipInstallation(installation.root, version)
          if (existing === 'incomplete') return { status: 'zip-incomplete' }
          if (existing === 'complete') return { status: discovered.installedVersions.includes(version) ? 'success' : 'zip-incomplete' }
          if (!zipTransport) return { status: 'zip-download' }
          let transport: NodeFetch
          try { transport = await zipTransport(getDownloadProxy(discovered.installation)) }
          catch { return { status: 'zip-download' } }
          const archive = await downloadNodeZip(version, transport, phase)
          phase('extracting')
          await installVerifiedNodeZip({ root: installation.root, version, archive, beforePublish: async staging => {
            const fresh = discovered.installation
            if (fresh?.family === 'modern') {
              await checkModernStorage(staging)
              const policy = fresh.signingPolicy
              if (!policy) throw new NodeZipDownloadError('zip-integrity')
              const signer = await runPowerShell(nodeSignatureCheck(win32.join(staging, 'node.exe'), policy), 60_000)
                .catch(() => { throw Error('zip-blocked') })
              if (!allowedNodeSigner(signer, policy)) {
                throw new NodeZipDownloadError('zip-integrity')
              }
            }
            const current = await validate()
            if (current.activationDigest !== discovered.activationDigest || current.activeVersion !== discovered.activeVersion
              || current.activeSource !== discovered.activeSource || current.activeX64 !== discovered.activeX64) throw Error('nvm-settings-check')
          } })
          return { status: 'success' }
        } catch (error) {
          if (error instanceof IncompleteNodeInstallationError) return { status: 'zip-incomplete' }
          if (error instanceof NodeZipDownloadError) return { status: error.code }
          if (error instanceof Error && error.message === 'zip-permission') return { status: 'zip-permission' }
          if (error instanceof Error && error.message === 'zip-blocked') return { status: 'zip-blocked' }
          if (error instanceof Error && error.message === 'nvm-settings-check') return { status: 'nvm-settings-check' }
          const systemError = error as NodeJS.ErrnoException
          if (['EACCES', 'EPERM'].includes(systemError.code ?? '')) return { status: 'zip-permission' }
          if (systemError.code === 'ERROR_VIRUS_INFECTED' || systemError.code === 'ERROR_VIRUS_DELETED') return { status: 'zip-blocked' }
          return { status: 'zip-extraction' }
        }
      }
      if (installation.family === 'modern') {
        let shell: Awaited<ReturnType<typeof resolveSystemPowerShell>>
        let args: string[]
        try {
          args = modernCommand(installation, command, version)
          shell = await resolveSystemPowerShell()
        } catch { return { status: 'integrity-failed' } }
        try {
          const { stdout } = await exec(shell.powershell, args, shell.options)
          return readElevatedExit(stdout, 0)
        } catch { return { status: 'unknown' } }
      }
      let invocation: ElevationInvocation
      try {
        invocation = buildNvmInvocation(installation, command, version)
      } catch {
        return { status: 'integrity-failed' }
      }
      return elevate(invocation)
    },
    async installManager(phase) {
      phase('downloading')
      let bytes: Buffer
      try {
        bytes = await fetchBoundedAsset(request, NVM_INSTALLER_URL, GITHUB_ASSET_ORIGINS, MAX_INSTALLER_BYTES)
      } catch {
        return { status: 'download-failed' }
      }
      if (createHash('sha256').update(bytes).digest('hex') !== NVM_INSTALLER_SHA256) {
        return { status: 'integrity-failed' }
      }
      let directory: string | undefined
      let outcome: ElevatedResult | undefined
      try {
        directory = await mkdtemp(win32.join(tmpdir(), 'workrail-nvm-'))
        const executable = win32.join(directory, 'nvm-setup.exe')
        await writeFile(executable, bytes, { flag: 'wx' })
        phase('waiting')
        outcome = await elevate({ executable, executableDigest: NVM_INSTALLER_SHA256, args: [] })
        return outcome
      } catch {
        return { status: 'failed' }
      } finally {
        // If the bridge disappeared without an exit code, the installer may
        // still own files. Windows can remove the temporary directory later.
        if (directory && outcome?.status !== 'unknown') await rm(directory, { recursive: true, force: true }).catch(() => {})
      }
    },
  }
}
