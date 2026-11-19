import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createWindowsNodeAdapter } from '../../src/main/node-management/windows'

const io = vi.hoisted(() => ({ exec: vi.fn(), realpath: vi.fn(), stat: vi.fn() }))
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: io.exec }) }
})
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(), realpath: io.realpath, stat: io.stat,
}))

const namespace = String.raw`\\?\GLOBALROOT\SystemRoot\System32`
const system = String.raw`D:\Installed Windows\System32`
const powershell = String.raw`D:\Installed Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
const home = String.raw`D:\nvm`
const installation = { family: 'classic' as const, version: '1.2.2' as const, executableDigest: '665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13', exe: home + '\\nvm.exe', home, root: home, symlink: 'D:\\nodejs', settingsDigest: 'a'.repeat(64) }
const directory = { dev: 21n, ino: 94n, isDirectory: () => true }
const decode = (arg: string) => Buffer.from(arg, 'base64').toString('utf16le')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SystemRoot', 'X:\\Caller')
  vi.stubEnv('wInDiR', 'X:\\Caller')
  vi.stubEnv('cOmSpEc', 'X:\\Caller\\cmd.exe')
  vi.stubEnv('pAtH', 'X:\\Caller')
  io.realpath.mockImplementation(async path => {
    if (path === namespace) return system
    throw Error('unexpected lookup')
  })
  io.stat.mockImplementation(async path => {
    if (path === namespace || path === system) return directory
    throw Error('unexpected stat')
  })
  io.exec.mockResolvedValue({ stdout: 'WORKRAIL_EXIT:0', stderr: '' })
})
afterEach(() => vi.unstubAllEnvs())

it('uses the OS system directory for both PowerShell processes, command lookup and working directories', async () => {
  const adapter = createWindowsNodeAdapter(vi.fn())
  expect(await adapter.changeVersion(installation, 'use', '22.9.0')).toEqual({ status: 'success' })
  expect(io.exec).toHaveBeenCalledTimes(1)
  const [launcher, args, options] = io.exec.mock.calls[0]
  expect(launcher).toBe(powershell)
  expect(options.cwd).toBe(system)
  const env = Object.entries(options.env).map(([key, value]) => [key.toLowerCase(), value])
  expect(env.filter(([key]) => ['path', 'comspec', 'systemroot', 'windir'].includes(key as string)).sort()).toEqual([
    ['comspec', system + '\\cmd.exe'], ['path', system], ['systemroot', 'D:\\Installed Windows'], ['windir', 'D:\\Installed Windows'],
  ])
  const outer = decode(args.at(-1))
  expect(outer).toContain("-FilePath '" + powershell + "' -WorkingDirectory '" + system + "' -Verb RunAs")
  expect(outer).toMatch(/\[Environment\]::SystemDirectory[\s\S]*WORKRAIL_EXIT:1610[\s\S]*Start-Process/i)
  const worker = decode(outer.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)![1])
  expect(worker).toMatch(/\[Environment\]::SystemDirectory[\s\S]*exit 1610[\s\S]*Open-VerifiedFile '/i)
  expect(worker).toContain("Set-Location -LiteralPath '" + system + "'")
  expect(worker).toContain("$env:Path = '" + system + "'")
  expect(worker).toContain("$env:ComSpec = '" + system + "\\cmd.exe'")
  expect(outer + worker).not.toContain('X:\\Caller')
})

it.each(['resolver unavailable', 'non-local result', 'different directory identity'] as const)(
  'blocks all process launches when the native system directory cannot be established (%s)', async failure => {
    if (failure === 'resolver unavailable') io.realpath.mockRejectedValue(Error('unavailable'))
    if (failure === 'non-local result') io.realpath.mockResolvedValue('\\\\server\\share\\System32')
    if (failure === 'different directory identity') {
      io.stat.mockImplementation(async path => path === namespace ? directory : { ...directory, ino: 95n })
    }
    const adapter = createWindowsNodeAdapter(vi.fn())
    expect(await adapter.changeVersion(installation, 'use', '22.9.0')).toEqual({ status: 'integrity-failed' })
    await expect(adapter.discover()).rejects.toThrow()
    expect(io.exec).not.toHaveBeenCalled()
  },
)

it('launches 2.0.1 in the user account, with the registry snapshot and an offline exact-version switch', async () => {
  const adapter = createWindowsNodeAdapter(vi.fn())
  const modern = { ...installation, family: 'modern' as const, version: '2.0.1' as const, mode: 'shim' as const, executableDigest: '0a8b88433fde1cbf48a03b7589b744361b20b4401a3be167614f82c62d26b29e' }
  expect(await adapter.changeVersion(modern, 'use', '22.9.0')).toEqual({ status: 'success' })
  const [, args] = io.exec.mock.calls[0]
  const worker = decode(args.at(-1))
  expect(worker).toContain(modern.executableDigest)
  expect(worker).toContain(modern.settingsDigest)
  expect(worker).toContain("'use', '22.9.0', '--local'")
  expect(worker).toContain('Registry64')
  expect(worker).not.toContain('-Verb RunAs')
  expect(await adapter.changeVersion({ ...modern, executableDigest: 'a'.repeat(64) }, 'install', '22.9.0')).toEqual({ status: 'integrity-failed' })
})
