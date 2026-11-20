import { X509Certificate } from 'node:crypto'
import { win32 } from 'node:path'
import { rootCertificates } from 'node:tls'
import { beforeEach, expect, it, vi } from 'vitest'
import { capabilities, classicDigests, modernReleases } from '../../src/main/node-management/manager-support'
import { setDownloadProxy, type NvmInstallation } from '../../src/main/node-management/discovery'
import { nodeSigningPolicy, allowedNodeSigner } from '../../src/main/node-management/node-signing'
import { ZipStepError } from '../../src/main/node-management/zip-diagnostics'
import { createWindowsNodeAdapter } from '../../src/main/node-management/windows'

const io = vi.hoisted(() => ({ exec: vi.fn(), endInput: vi.fn(), download: vi.fn(), stage: vi.fn(), prepare: vi.fn() }))
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: (...args: unknown[]) => Object.assign(io.exec(...args), { child: { stdin: { end: io.endInput } } }) }) }
})
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  realpath: async () => 'C:\\Windows\\System32',
  stat: async () => ({ isDirectory: () => true, dev: 1n, ino: 2n }),
}))
vi.mock('../../src/main/node-management/zip-download', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/main/node-management/zip-download')>(), downloadNodeZip: io.download,
}))
vi.mock('../../src/main/node-management/zip-install', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/main/node-management/zip-install')>(),
  installVerifiedNodeZip: io.stage, prepareNodeZipRoot: io.prepare, inspectNodeZipInstallation: async () => 'absent',
}))

const version = '22.9.0'
const proxy = 'http://example.test:3128'
const home = 'C:\\관리자'
const root = 'D:\\Node 저장소\\installs'
const paths = { home, root, exe: win32.join(home, 'nvm.exe'), symlink: 'D:\\Node 저장소\\.nodejs', settingsDigest: 'a'.repeat(64) }
const leaf = new X509Certificate(rootCertificates.find(pem => new X509Certificate(pem).subject.includes('O='))!)
const signer = leaf.subject.split('\n').find(field => field.startsWith('O='))!.slice(2)
const signingPolicy = { signers: [signer], thumbprints: [leaf.fingerprint.replaceAll(':', '')], cached: true }
const managers: NvmInstallation[] = [
  ...Object.entries(classicDigests).map(([version, executableDigest]) => ({ ...paths, version, executableDigest, family: 'classic' as const })),
  ...modernReleases.map(({ version, digest }) => ({ ...paths, version, executableDigest: digest, family: 'modern' as const, mode: 'shim' as const, signingPolicy })),
]

beforeEach(() => {
  vi.resetAllMocks()
  io.download.mockResolvedValue(Buffer.from('archive'))
  io.stage.mockImplementation(async options => { await options.beforePublish(win32.join(root, '.stage')) })
  io.exec.mockImplementation(async (_exe, args) => {
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
    if (script.includes('GetAccessRules(')) return { stdout: 'VERIFIED' }
    if (script.includes('WorkRailNodeTrust')) return { stdout: leaf.raw.toString('base64') }
    throw Error('Unexpected process')
  })
})

it.each(managers)('uses only the ZIP transport and staged publication with $version', async manager => {
  setDownloadProxy(manager, proxy)
  const request = vi.fn()
  const transport = vi.fn().mockResolvedValue(request)
  const adapter = createWindowsNodeAdapter(vi.fn(), transport)
  adapter.discover = vi.fn().mockResolvedValue({
    installation: manager, capabilities: capabilities(null), installedVersions: [], activeVersion: null, activeSource: null,
  })
  expect(await adapter.changeVersion(manager, 'install', version)).toEqual({ status: 'success' })
  expect(io.prepare).toHaveBeenCalledWith(root, version, manager.family === 'modern')
  expect(transport).toHaveBeenCalledWith(proxy)
  expect(io.download).toHaveBeenCalledWith(version, request, expect.any(Function))
  expect(io.stage).toHaveBeenCalledOnce()
  expect(adapter.discover).toHaveBeenCalledTimes(2)
  expect(io.exec).toHaveBeenCalledTimes(manager.family === 'modern' ? 3 : 0)
})

it('rejects a staged modern binary when its signer fails the effective pin', async () => {
  const manager = { ...managers.at(-1)!, family: 'modern' as const, version: '2.0.0' as const, mode: 'shim' as const,
    signingPolicy: { ...signingPolicy, thumbprints: ['A'.repeat(40)] } }
  const adapter = createWindowsNodeAdapter(vi.fn(), async () => fetch)
  adapter.discover = vi.fn().mockResolvedValue({ installation: manager, capabilities: capabilities(null), installedVersions: [] })
  expect(await adapter.changeVersion(manager, 'install', version)).toEqual({ status: 'zip-integrity' })
  expect(allowedNodeSigner(leaf.raw.toString('base64'), { ...signingPolicy, signers: ['Other Publisher'] })).toBe(false)
  expect(nodeSigningPolicy({ AllowedThumbprints: ['bad'] })).toBeNull()
})

it.each([
  ['POLICY', 'acl-policy', undefined],
  ['READ_ERROR:5', 'acl-read', 'WIN32_5'],
  ['private account path', 'acl-read', undefined],
])('distinguishes the modern storage verdict %s before downloading', async (stdout, stage, osCode) => {
  const manager = managers.at(-1)!
  io.exec.mockResolvedValue({ stdout })
  const adapter = createWindowsNodeAdapter(vi.fn(), async () => fetch)
  adapter.discover = vi.fn().mockResolvedValue({ installation: manager, capabilities: capabilities(null), installedVersions: [] })
  const failed = await adapter.changeVersion(manager, 'install', version)
  expect(failed).toEqual({ status: 'zip-permission', detail: { stage, role: 'root', ...(osCode ? { osCode } : {}) } })
  expect(io.download).not.toHaveBeenCalled()
})

it('omits command lines, account paths and proxy credentials when the staged ACL reader fails to run', async () => {
  const manager = managers.at(-1)!
  const secret = 'https://user:password@proxy.test'
  io.exec.mockResolvedValueOnce({ stdout: 'VERIFIED' }).mockRejectedValueOnce(
    Object.assign(new Error(secret + home), { code: 1, stderr: home, cmd: secret }))
  const adapter = createWindowsNodeAdapter(vi.fn(), async () => fetch)
  adapter.discover = vi.fn().mockResolvedValue({ installation: manager, capabilities: capabilities(null), installedVersions: [] })
  expect(await adapter.changeVersion(manager, 'install', version)).toEqual({
    status: 'zip-permission', detail: { stage: 'acl-read', role: 'staging' },
  })
})

it('reports a confirmed partial destination after rename while passing only the original stage and OS evidence', async () => {
  const manager = managers[0]
  const failure = Object.assign(new ZipStepError('publish', 'target', Object.assign(new Error(home), { code: 'EPERM' })),
    { incompleteTarget: true })
  io.stage.mockRejectedValueOnce(failure)
  const adapter = createWindowsNodeAdapter(vi.fn(), async () => fetch)
  adapter.discover = vi.fn().mockResolvedValue({ installation: manager, capabilities: capabilities(null), installedVersions: [] })
  expect(await adapter.changeVersion(manager, 'install', version)).toEqual({
    status: 'zip-incomplete', detail: { stage: 'publish', role: 'target', osCode: 'EPERM' },
  })
})
