import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { createWindowsNodeAdapter, resolveSystemPowerShell } from '../../src/main/node-management/windows'
import { createNodeManagementService } from '../../src/main/node-management/service'
import { inspectNodeZipInstallation } from '../../src/main/node-management/zip-install'
import { capabilities, classicDigests } from '../../src/main/node-management/manager-support'

const version = '24.22.1'
const npmVersion = '11.19.1'
const release = { version, date: '2026-10-20', npm: npmVersion, security: false, lts: 'Krypton' }
const directory = process.env.WORKRAIL_TEST_NVM_DIRECTORY
const hostedWindows = process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_OS === 'Windows' && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
const runner = hostedWindows && !!directory
it.skipIf(!runner)('installs the signed Windows ZIP and switches using official nvm 1.1.10, 1.1.11 and 1.2.2', async () => {
  for (const manager of ['1.1.10', '1.1.11', '1.2.2'] as const) {
    const home = join(directory!, manager), link = join(directory!, 'node-' + manager)
    const root = manager === '1.2.2' ? join(directory!, 'Node 저장소') : home
    await mkdir(root, { recursive: true })
    const exe = join(home, 'nvm.exe')
    expect(createHash('sha256').update(await readFile(exe)).digest('hex')).toBe(classicDigests[manager])
    await writeFile(join(home, 'settings.txt'), ['root: ' + root, 'path: ' + link, 'arch: 64', 'proxy: none', ''].join('\r\n'))
    const env = { ...process.env, NVM_HOME: home, NVM_SYMLINK: link }
    const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: home, env, encoding: 'utf8', timeout: 30_000 }).trim()
    // Select the disposable manager directly without changing the runner's registered nvm.
    const windows = createWindowsNodeAdapter(fetch, async () => fetch)
    windows.discover = async () => ({
      manager: { status: 'ready', version: manager, path: exe },
      installation: {
        family: 'classic', version: manager, home, root, symlink: link, exe,
        executableDigest: createHash('sha256').update(await readFile(exe)).digest('hex'),
        settingsDigest: createHash('sha256').update(await readFile(join(home, 'settings.txt'))).digest('hex'),
      },
      installedVersions: await inspectNodeZipInstallation(root, version) === 'complete' ? [version] : [],
      activeVersion: null, activeSource: null, conflicts: [], capabilities: capabilities(null),
    })
    const service = createNodeManagementService({
      platform: 'win32', arch: 'x64', changed: () => {},
      loadCatalog: async () => [release],
      windows: {
        discover: windows.discover, changeVersion: windows.changeVersion.bind(windows),
        recognizesVersion: windows.recognizesVersion, installManager: windows.installManager,
      },
    })
    expect(await service.install(version)).toMatchObject({ installedVersions: [version], activeVersion: null, error: null })
    await expect(lstat(link)).rejects.toMatchObject({ code: 'ENOENT' })
    run(exe, ['use', version, '64'])
    expect((await realpath(link)).toLowerCase()).toBe((await realpath(join(root, 'v' + version))).toLowerCase())
    const node = join(link, 'node.exe')
    expect(run(node, ['-v'])).toBe('v' + version)
    expect(run(node, [join(link, 'node_modules/npm/bin/npm-cli.js'), '-v'])).toBe(npmVersion)
  }
}, 360_000)

const modernMode = process.env.WORKRAIL_TEST_NVM_MODERN_MODE
const modernRunner = hostedWindows && (modernMode === 'shim' || modernMode === 'link')

// Report stage timings only. The reader and serializer exercise the original probe
// without writing registry values to either stream.
const diagnosticScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::WriteLine('started')
$phase = 'registry'
try {
  $result = @{}
  foreach ($key in @(
    [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment')
    [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
  )) {
    if ($null -eq $key) { continue }
    try {
      $values = @{}
      foreach ($name in $key.GetValueNames()) {
        $value = $key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($value -is [string]) { $values[$name] = $value }
      }
      $result[$key.Name] = $values
    } finally { $key.Dispose() }
  }
  [Console]::WriteLine('read')
  $phase = 'serialization'
  $null = $result | ConvertTo-Json -Compress
  [Console]::WriteLine('serialized')
} catch {
  [Console]::WriteLine("failed-$phase")
  exit 1
}
`

async function diagnoseDiscoveryTiming() {
  const { powershell, options } = await resolveSystemPowerShell()
  const encoded = Buffer.from(diagnosticScript, 'utf16le').toString('base64')
  function measure(env: NodeJS.ProcessEnv): Promise<string> {
    const startedAt = Date.now()
    const markers: string[] = []
    return new Promise(resolve => {
      const child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { ...options, env, timeout: 30_000 }, error => {
          const outcome = error ? JSON.stringify({ code: error.code, signal: error.signal, killed: error.killed }) : 'exit 0'
          resolve([...markers, outcome + ' after ' + (Date.now() - startedAt) + 'ms'].join(', '))
        })
      child.stdin?.end()
      let pending = ''
      child.stdout?.on('data', chunk => {
        const lines = (pending + chunk.toString()).split(/\r?\n/)
        pending = lines.pop() ?? ''
        for (const line of lines) {
          if (/^(started|read|serialized|failed-registry|failed-serialization)$/.test(line)) markers.push(line + ' ' + (Date.now() - startedAt) + 'ms')
        }
      })
    })
  }
  const system = await measure(options.env)
  const env = { ...options.env } as NodeJS.ProcessEnv
  for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) env[key] = process.env[key]
  const profile = await measure(env)
  return 'Closed stdin, system environment: ' + system + '\nClosed stdin, with profile paths: ' + profile
}

it.skipIf(!modernRunner)('installs the first ZIP on official nvm 2.0.1 and activates it on request', async () => {
  const windows = createWindowsNodeAdapter(fetch, async () => fetch)
  const initial = await windows.discover().catch(async error => {
    // execFile's normal message starts with the entire UTF-16 EncodedCommand.
    // Surface the exit evidence first so CI can distinguish a timeout from a registry or module error.
    if (!error || typeof error !== 'object' || !('cmd' in error)) throw error
    const exit = JSON.stringify({ code: error.code, signal: error.signal, killed: error.killed })
    const timing = await diagnoseDiscoveryTiming().catch(() => 'Diagnostic unavailable')
    throw new Error('Windows environment discovery failed ' + exit + '\n' + timing + '\n' + String(error.stderr || 'No PowerShell stderr'))
  })
  expect(initial).toMatchObject({
    manager: { status: 'ready', version: '2.0.1' },
    installation: { family: 'modern', mode: modernMode, root: process.env.WORKRAIL_TEST_NVM_ROOT },
    installedVersions: [], activeVersion: null, conflicts: [],
    capabilities: { install: { available: true }, use: { available: true } },
  })
  const manager = initial.installation!
  const readTarget = (path: string) => readlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const linkTargets = () => Promise.all([manager.symlink, join(dirname(manager.root), '.link', 'nodejs')].map(readTarget))
  const shell = join(process.env.SystemRoot!, 'System32', 'cmd.exe')
  const env = { ...process.env }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'Path'
  env[pathKey] = [manager.symlink, manager.home, dirname(shell)].join(';')
  const run = (exe: string, args: string[]) => execFileSync(exe, args, {
    cwd: process.env.TEMP, env,
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
  }).trim()
  const userPath = () => execFileSync(join(dirname(shell), 'reg.exe'), ['query', 'HKCU\\Environment', '/v', 'Path'], { encoding: 'utf8' })
  const originalPath = userPath()
  const originalTargets = await linkTargets()
  const phases = new Set<string>()
  const leaseFailures: string[] = []
  function describeFailure(error: unknown) {
    if (!(error instanceof Error)) return String(error)
    const processError = error as Error & { code?: string; signal?: string; killed?: boolean; stderr?: string; cmd?: string }
    if (!processError.cmd) return error.message
    const exit = JSON.stringify({ code: processError.code, signal: processError.signal, killed: processError.killed })
    return processError.cmd.split(' -EncodedCommand')[0] + ' ' + exit + '\n' + (processError.stderr || 'No PowerShell stderr')
  }
  // Preserve the first, cold call and the actual lease. The service maps exceptions
  // to operation-unknown, so retain the original exception for a failed assertion.
  const acquire = windows.acquireMutation!.bind(windows)
  windows.acquireMutation = async kind => {
    try { return await acquire(kind) }
    catch (error) {
      leaseFailures.push('Machine lock acquisition: ' + describeFailure(error))
      throw error
    }
  }
  const service = createNodeManagementService({
    platform: 'win32', arch: 'x64', windows,
    changed: state => { if (state.busy) phases.add(state.busy.phase) },
    loadCatalog: async () => [release],
  })
  const installed = await service.install(version)
  if (installed.error) {
    const lock = await windows.mutationStatus!().catch(error => describeFailure(error))
    const folder = await inspectNodeZipInstallation(manager.root, version).catch(error => describeFailure(error))
    const details: string[] = []
    if (folder === 'complete') {
      try {
        const after = await windows.discover()
        details.push('WorkRail discovery: ' + JSON.stringify({
          manager: after.manager.status, versions: after.installedVersions,
          active: after.activeVersion, source: after.activeSource, conflicts: after.conflicts.map(conflict => conflict.code),
          sameSettings: after.installation?.settingsDigest === manager.settingsDigest,
          sameActivation: after.activationDigest === initial.activationDigest,
          samePath: userPath() === originalPath,
          sameLinks: JSON.stringify(await linkTargets()) === JSON.stringify(originalTargets),
        }))
      } catch (error) { details.push('WorkRail discovery: ' + describeFailure(error)) }
      try { details.push('WorkRail manager versions: ' + JSON.stringify(await windows.managerVersions!(manager))) }
      catch (error) { details.push('WorkRail manager versions: ' + describeFailure(error)) }
      try { details.push('nvm list installed: ' + run(manager.exe, ['list', 'installed'])) }
      catch (error) { details.push('nvm list installed: ' + describeFailure(error)) }
    }
    throw new Error(['WorkRail install failed: ' + installed.error.code, 'Observed phases: ' + [...phases].join(', '),
      ...leaseFailures, 'Machine lock after failure: ' + lock, 'Node directory after failure: ' + folder, ...details].join('\n'))
  }
  expect(installed).toMatchObject({ installedVersions: [version], activeVersion: null, error: null })
  for (const phase of ['downloading', 'authenticating', 'extracting', 'verifying']) expect(phases.has(phase)).toBe(true)
  expect(await linkTargets()).toEqual(originalTargets)
  expect(userPath()).toBe(originalPath)
  expect(await service.getState('recheck')).toMatchObject({ activeVersion: null, installedVersions: [version], error: null })
  expect(run(manager.exe, ['list', 'installed'])).toContain(version)
  expect(await service.use(version)).toMatchObject({ activeVersion: version, activeSource: 'nvm', error: null })
  expect(run(join(manager.symlink, 'node.exe'), ['-v'])).toBe('v' + version)
  expect(run(shell, ['/d', '/c', 'npm -v'])).toBe(npmVersion)
}, 360_000)
