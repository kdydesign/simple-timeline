import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { isNodeVersion } from '../../shared/node-management'
import { readDownload, type NodeFetch } from './catalog'
import { discoverWindowsNode, isSafeNvmPath, type NvmInstallation } from './discovery'
import type { ElevatedResult, WindowsNodeAdapter } from './service'

export const NVM_INSTALLER_URL = 'https://github.com/nvm-windows/nvm/releases/download/1.2.2/nvm-setup.exe'
const NVM_INSTALLER_SHA256 = '2d5ad523aa6182205da77c0eb8210638aaa8792f4e6a4bc12e1ac854c5455a68'
const MAX_INSTALLER_BYTES = 12 * 1024 * 1024
const exec = promisify(execFile)

type ElevationInvocation =
  | { executable: string; args: ['install' | 'use', string, '64']; nvmHome: string; nvmSymlink: string }
  | { executable: string; args: [] }

export function buildNvmInvocation(installation: NvmInstallation, command: 'install' | 'use', version: string): ElevationInvocation {
  for (const path of [installation.exe, installation.home, installation.root, installation.symlink]) {
    if (!isSafeNvmPath(path)) throw Error('Invalid nvm path')
  }
  if (win32.join(installation.home, 'nvm.exe').toLowerCase() !== installation.exe.toLowerCase()
    || (command !== 'install' && command !== 'use') || !isNodeVersion(version)) throw Error('Invalid nvm command')
  return { executable: installation.exe, args: [command, version, '64'], nvmHome: installation.home, nvmSymlink: installation.symlink }
}

const psLiteral = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const psArgs = (script: string): string[] => [
  '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
]

export function createElevationCommand(powershell: string, invocation: ElevationInvocation): string[] {
  const system = win32.dirname(win32.dirname(win32.dirname(powershell)))
  let executable = invocation.executable
  let argumentsOption = ''
  let windowStyle = ''
  if ('nvmHome' in invocation) {
    const [command, version, arch] = invocation.args
    // nvm 1.x launches cmd and may look for node on PATH. Do not carry the
    // renderer process's user PATH, current directory, or Node configuration
    // into an elevated command. cmd AutoRun is also checked under that account.
    const elevatedScript = `
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath ${psLiteral(system)}
$env:Path = ${psLiteral(system)}
$env:ComSpec = ${psLiteral(win32.join(system, 'cmd.exe'))}
$env:NoDefaultCurrentDirectoryInExePath = '1'
$env:NODE_OPTIONS = $null
$env:NODE_PATH = $null
$env:NVM_HOME = ${psLiteral(invocation.nvmHome)}
$env:NVM_SYMLINK = ${psLiteral(invocation.nvmSymlink)}
foreach ($key in @('HKCU:\\Software\\Microsoft\\Command Processor', 'HKLM:\\Software\\Microsoft\\Command Processor')) {
  if (Get-ItemPropertyValue -LiteralPath $key -Name AutoRun -ErrorAction SilentlyContinue) { exit 1 }
}
& ${psLiteral(invocation.executable)} ${psLiteral(command)} ${psLiteral(version)} ${psLiteral(arch)}
exit $LASTEXITCODE
`
    executable = powershell
    argumentsOption = ' -ArgumentList ' + psLiteral(psArgs(elevatedScript).join(' '))
    windowStyle = ' -WindowStyle Hidden'
  }
  return psArgs(`
$ErrorActionPreference = 'Stop'
try {
  $child = Start-Process -FilePath ${psLiteral(executable)} -WorkingDirectory ${psLiteral(system)} -Verb RunAs${argumentsOption}${windowStyle} -PassThru -Wait
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
`)
}

export function readElevatedExit(stdout: string, wrapperExit: number, installer = false): ElevatedResult {
  if (wrapperExit !== 0) return { status: 'unknown' }
  const result = stdout.trim()
  if (result === 'WORKRAIL_ELEVATION_CANCELLED') return { status: 'cancelled' }
  const code = /^WORKRAIL_EXIT:(-?\d+)$/.exec(result)?.[1]
  if (code === undefined) return { status: 'unknown' }
  if (installer && ['2', '5'].includes(code)) return { status: 'cancelled' }
  return { status: code === '0' ? 'success' : 'failed' }
}

const registryEnvironmentScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
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
[Console]::WriteLine((@{ machine = $machine; user = $user } | ConvertTo-Json -Compress))
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
  return {
    Path: expand(path || inherited.Path || inherited.PATH || ''),
    NVM_HOME: expand(lookup.get('NVM_HOME') ?? ''),
    NVM_SYMLINK: expand(lookup.get('NVM_SYMLINK') ?? ''),
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

async function downloadNvmInstaller(request: NodeFetch) {
  const signal = AbortSignal.timeout(45_000)
  const githubAssetHosts = new Set(['https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com'])
  let url = new URL(NVM_INSTALLER_URL)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await request(url.href, { redirect: 'manual', credentials: 'omit', signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) return readDownload(response, MAX_INSTALLER_BYTES)
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location) throw Error('No installer redirect target')
    url = new URL(location, url)
    if (!githubAssetHosts.has(url.origin) || url.username || url.password) throw Error('Unexpected installer redirect')
  }
  throw Error('Too many installer redirects')
}

export function createWindowsNodeAdapter(request: NodeFetch): WindowsNodeAdapter {
  const system = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  const powershell = win32.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const localOptions = { cwd: system, windowsHide: true, shell: false as const, maxBuffer: 512 * 1024 }

  async function runPowerShell(script: string, timeout = 8_000) {
    return (await exec(powershell, psArgs(script), { ...localOptions, timeout })).stdout.trim()
  }

  async function elevate(invocation: ElevationInvocation) {
    try {
      // Start-Process -Wait tracks process completion through the UAC bridge.
      // Killing this bridge at a timeout would lose the elevated process handle.
      const { stdout } = await exec(powershell, createElevationCommand(powershell, invocation), localOptions)
      return readElevatedExit(stdout, 0, !('nvmHome' in invocation))
    } catch {
      return { status: 'unknown' } as const
    }
  }

  return {
    discover: () => discoverWindowsNode({
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
      resolvePath: realpath,
      listDirectories: async path => (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name),
      async readSettings(path) {
        const handle = await open(path, 'r')
        try {
          if ((await handle.stat()).size > 64 * 1024) throw Error('Unexpected nvm settings size')
          return await handle.readFile('utf8')
        } finally {
          await handle.close()
        }
      },
      getManagerVersion: async path => (await exec(path, ['version'], { ...localOptions, timeout: 5_000 })).stdout.trim(),
      async getNodeVersion(path) {
        if (!path.toLowerCase().endsWith('node.exe')) return null
        // File metadata is sufficient for a diagnostic and avoids executing a
        // PATH-selected standalone program just to learn its version.
        const version = await runPowerShell(`[Console]::WriteLine([Diagnostics.FileVersionInfo]::GetVersionInfo(${psLiteral(path)}).ProductVersion)`)
        return /^v?(\d+\.\d+\.\d+)(?:\.0)?$/.exec(version)?.[1] ?? null
      },
      isX64Node,
    }),
    changeVersion: (installation, command, version) => elevate(buildNvmInvocation(installation, command, version)),
    async installManager(phase) {
      phase('downloading')
      let bytes: Buffer
      try {
        bytes = await downloadNvmInstaller(request)
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
        const staged = createHash('sha256').update(await readFile(executable)).digest('hex')
        if (staged !== NVM_INSTALLER_SHA256) return { status: 'integrity-failed' }
        phase('waiting')
        outcome = await elevate({ executable, args: [] })
        return outcome
      } finally {
        // If the bridge disappeared without an exit code, the installer may
        // still own files. Windows can remove the temporary directory later.
        if (directory && outcome?.status !== 'unknown') await rm(directory, { recursive: true, force: true }).catch(() => {})
      }
    },
  }
}
