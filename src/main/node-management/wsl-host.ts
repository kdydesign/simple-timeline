import { execFile, spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { StringDecoder } from 'node:string_decoder'
import { isEnvironmentId, isNodeVersion, type NodeEnvironment } from '../../shared/node-management'
import { changeScript, parseGuestProbe, probeScript, superviseScript, type WslInspection } from './wsl-guest'
import { resolveSystemPowerShell } from './windows'

const exec = promisify(execFile)
const registryScript = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Lxss')
$rows=@()
if ($null -ne $key) {
  foreach ($id in $key.GetSubKeyNames()) {
    if ($id -notmatch '^\\{[0-9a-fA-F-]{36}\\}$') {continue}
    $entry=$key.OpenSubKey($id)
    $rows+=@{id=$id.Trim('{}').ToLowerInvariant();name=$entry.GetValue('DistributionName');version=$entry.GetValue('Version')}
    $entry.Dispose()
  }
  $key.Dispose()
}
ConvertTo-Json -InputObject $rows -Compress
`

export function decodeList(bytes: Buffer) {
  const encoding = bytes.includes(0) || (bytes[0] === 0xff && bytes[1] === 0xfe) ? 'utf16le' : 'utf8'
  return bytes.toString(encoding).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
}

export async function listWsl(registry: () => Promise<unknown>, running: () => Promise<Buffer>): Promise<NodeEnvironment[]> {
  const rows = await registry()
  if (!Array.isArray(rows)) throw Error('Invalid WSL registry')
  const items: NodeEnvironment[] = []
  for (const row of rows) {
    if (row?.version === 1) continue
    const id = 'wsl:' + row?.id, name = row?.name
    if (row?.version !== 2 || !isEnvironmentId(id) || typeof name !== 'string' || !name || /^-|[\x00-\x1f\x7f]/.test(name)) throw Error('Invalid WSL registration')
    items.push({ id, kind: 'wsl2', label: name, distro: name, running: false })
  }
  if (!items.length) return items
  const names = decodeList(await running())
  const registered = new Set(rows.map(row => row.name))
  if (names.some(name => !registered.has(name))) throw Error('Invalid or changing WSL running list')
  return items.map(e => ({ ...e, running: names.includes(e.distro!) }))
}

const validUser = (user: string) => !!user && user.length <= 256 && !/^-|[\s\x00-\x1f\x7f/:]/.test(user)
type WslCall = (args: string[]) => Promise<Buffer>
export type WslOutcome = 'success' | 'failed' | 'cancelled' | 'unknown'
type WslJob = (args: string[], signal: AbortSignal, line: (value: string) => void) => Promise<WslOutcome>

// Read the selected account's login environment. Pass scripts and all data as
// separate argv through the login shell. Other shell families use POSIX profile.
const loginScript = `
account=$(/usr/bin/getent passwd "$(/usr/bin/id -u)") || exit 71
shell=$(printf '%s' "$account" | /usr/bin/cut -d: -f7)
case "$shell" in
  /bin/bash|/usr/bin/bash|/bin/zsh|/usr/bin/zsh|/bin/dash|/bin/sh) ;;
  *) shell=/bin/sh;;
esac
exec "$shell" -lc 'exec /bin/sh -c "$@"' workrail "$@"
`
function login(script: string, ...args: string[]) {
  return ['/bin/sh', '-c', loginScript, 'workrail', script, 'workrail', ...args]
}

export function createWslRunner(discover: () => Promise<NodeEnvironment[]>, call: WslCall, job?: WslJob) {
  async function target(env: NodeEnvironment, allowStart = false) {
    const match = (await discover()).find(e => e.id === env.id && e.kind === 'wsl2' && e.distro === env.distro)
    if (!match?.distro || (!allowStart && !match.running)) throw Error('WSL environment changed or stopped')
    return ['--distribution', match.distro]
  }

  async function defaultUser(env: NodeEnvironment) {
    const args = await target(env)
    const user = (await call([...args, '--exec', '/usr/bin/id', '-un'])).toString('utf8').trim()
    if (!validUser(user)) throw Error('Invalid WSL default user')
    return user
  }

  async function forUser(env: NodeEnvironment, user: string) {
    if ((await defaultUser(env)) !== user) throw Error('WSL default user changed')
    return [...await target(env), '--user', user, '--cd', '~', '--exec']
  }

  return {
    defaultUser,
    async isStopped(env: NodeEnvironment) {
      const sameStoppedRegistration = async () => (await discover()).some(e =>
        e.kind === 'wsl2' && e.id === env.id && e.distro === env.distro && e.running === false)
      if (!await sameStoppedRegistration()) return false
      // Absence from --running includes transitional states. Require an
      // affirmative Stopped row and the same registration on both sides.
      const rows = decodeList(await call(['--list', '--verbose']))
      const stopped = rows.some(line => /^\s*(?:\*\s+)?(.+?)\s+Stopped\s+2\s*$/.exec(line)?.[1] === env.distro)
      return stopped && await sameStoppedRegistration()
    },
    async start(env: NodeEnvironment) { await call([...await target(env, true), '--exec', '/bin/true']) },
    async probe(env: NodeEnvironment, expected?: string) {
      const user = await defaultUser(env)
      if (expected && user !== expected) throw Error('WSL default user changed')
      const args = [...await target(env), '--user', user, '--cd', '~', '--exec']
      const snapshot = parseGuestProbe((await call([...args, ...login(probeScript)])).toString('utf8'))
      if (snapshot.user !== user) throw Error('WSL user mismatch')
      return snapshot
    },
    async change(env: NodeEnvironment, info: WslInspection, kind: 'install' | 'use', version: string, signal: AbortSignal, line: (value: string) => void): Promise<WslOutcome> {
      if (!job || !isNodeVersion(version)) throw Error('Invalid WSL command')
      const args = await forUser(env, info.user)
      if (signal.aborted) return 'cancelled'
      return job([...args, '/bin/sh', '-c', '"$@"; code=$?; printf "WORKRAIL_JOB_EXIT %s\\n" "$code" >&2; exit "$code"', 'workrail', '/usr/bin/setsid', '--wait', '/bin/sh', '-c', superviseScript, 'workrail',
        ...login(changeScript, kind, version, info.user, info.manager.path!, info.root, info.builder ?? '')], signal, line)
    },
  }
}

export async function runWslJob(args: string[], signal: AbortSignal, line: (value: string) => void): Promise<WslOutcome> {
  const { system, options } = await resolveSystemPowerShell()
  if (signal.aborted) return 'cancelled'
  return await new Promise(resolve => {
    const child = spawn(win32.join(system, 'wsl.exe'), args, options)
    let ack = false, exit: number | undefined
    const cancel = () => child.stdin.end('cancel\n')
    child.stdin.on('error', () => {}) // Process exit can close the pipe while a cancel is in flight.
    signal.addEventListener('abort', cancel, { once: true })
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8')
      let tail = ''
      function consume(value: string) {
        if (value === 'WORKRAIL_CANCEL_ACK') ack = true
        else if (/^WORKRAIL_JOB_EXIT [0-9]+$/.test(value)) exit = Number(value.split(' ')[1])
        else if (value) line(value.slice(-1500))
      }
      stream.on('data', (chunk: Buffer) => {
        const lines = (tail + decoder.write(chunk)).split(/[\r\n]/)
        tail = lines.pop()!.slice(-1500)
        lines.forEach(consume)
      })
      stream.on('end', () => consume(tail + decoder.end()))
    }
    child.once('error', () => { signal.removeEventListener('abort', cancel); resolve('failed') })
    child.once('close', code => {
      signal.removeEventListener('abort', cancel)
      if (signal.aborted && ack && exit === 137 && code === exit) resolve('cancelled')
      else if (code !== null && exit === code) resolve(code === 0 ? 'success' : 'failed')
      else resolve('unknown')
    })
  })
}

export function windowsWslHost() {
  const call: WslCall = async args => {
    const { system, options } = await resolveSystemPowerShell()
    const { stdout } = await exec(win32.join(system, 'wsl.exe'), args, { ...options, timeout: 30_000, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 })
    return stdout
  }
  const discover = () => listWsl(async () => {
    const { powershell, options } = await resolveSystemPowerShell()
    const result = await exec(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(registryScript, 'utf16le').toString('base64')], { ...options, timeout: 15_000 })
    return JSON.parse(result.stdout)
  }, () => call(['--list', '--running', '--quiet']))
  return { discover, ...createWslRunner(discover, call, runWslJob) }
}
