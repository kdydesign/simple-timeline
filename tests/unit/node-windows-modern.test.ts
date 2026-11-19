import { modernReleases } from '../../src/main/node-management/manager-support'
import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverWindowsNode, getDownloadProxy, type WindowsProbe } from '../../src/main/node-management/discovery'

const home = String.raw`C:\Users\Kim\AppData\Local\Author Software\nvm`
const root = win32.join(home, 'installs')
const path = (...parts: string[]) => win32.join(home, ...parts)
const cli = '0a8b88433fde1cbf48a03b7589b744361b20b4401a3be167614f82c62d26b29e'
const shim = '79c7fb995b45030f3366c4552085d1f2b389f0f46ac829d1932413ec2c3de26d'
const digests = new Map([
  [path('nvm.exe'), cli], [path('.shim', 'node.exe'), shim],
  [path('utils', 'reshim.exe'), '96b991812cf342833a225de9f5abe10a3f067bc5a898b30c6538f29530521b8d'],
  [path('utils', 'proxy.exe'), 'fb4256ea5f2f7a3cfceeed9f7bf889a031ad04e594f6e4c5a9851824f561af90'],
  [path('utils', 'sync.exe'), '26a564b61887676e55023e4f8476750988d425968c953bcc7126a14f035daf78'],
])
function inspect(settings: Record<string, unknown> = {}, broken?: 'list' | 'shim' | 'link' | 'command' | 'helper-read' | 'empty' | 'x86' | 'redirected-node', release = modernReleases[0] as typeof modernReleases[number]) {
  const linkedTarget = settings.OperatingMode === 'link' ? path('installs', 'v22.9.0') : path('.shim')
  const probe: WindowsProbe = {
    readEnvironment: async () => ({ Path: home + ';' + path('.nodejs'), NVM_HOME: home }),
    readModernSettings: async () => JSON.stringify({ WriteSources: {}, InstallRoot: root, OperatingMode: 'shim', ActiveVersion: '22.9.0', ...settings }),
    readLink: async () => settings.OperatingMode === 'link' ? path('.link', 'nodejs') : path('.shim'),
    pathKind: async p => p === path('.nodejs') ? 'symlink'
      : (broken === 'command' && p === path('.nodejs', 'node.com')) || digests.has(p) || (settings.ActiveVersion !== '' && p === path('.nodejs', 'node.exe')) || p === path('installs', 'v22.9.0', 'node.exe') ? 'file'
      : p === root || p === home ? 'directory' : 'missing',
    resolvePath: async p => {
      if (p === path('.nodejs') && settings.ActiveVersion === '' && settings.OperatingMode === 'link') throw Error('no active target')
      if (broken === 'redirected-node' && p === path('installs', 'v22.9.0', 'node.exe')) return 'D:\\other\\node.exe'
      return p === path('.nodejs') ? (broken === 'link' ? 'D:\\other' : linkedTarget) : p
    },
    completeNodePackage: async () => true,
    listDirectories: async () => { if (broken === 'list') throw Error('unreadable'); return broken === 'empty' ? [] : ['v22.9.0'] },
    readSettings: async () => { throw Error('2.x has no settings.txt') },
    getManagerDigest: async p => {
      if (broken === 'helper-read' && p === path('utils', 'reshim.exe')) throw Error('access denied')
      if (broken === 'shim' && p.endsWith('node.exe')) return 'bad'
      if (p === path('nvm.exe')) return release.digest
      return release.helpers[win32.relative(home, p) as keyof typeof release.helpers] ?? ''
    },
    getNodeVersion: async p => p === path('installs', 'v22.9.0', 'node.exe') ? '22.9.0' : null,
    isX64Node: async () => broken !== 'x86',
  }
  return discoverWindowsNode(probe)
}

describe('nvm-windows community registry layout', () => {
  it.each(modernReleases)('recognizes the verified $version CLI and its matching helpers', async release => {
    expect(await inspect({}, undefined, release)).toMatchObject({
      manager: { status: 'ready', version: release.version },
      installation: { family: 'modern', executableDigest: release.digest }, conflicts: [],
    })
  })

  it.each(['shim', 'link'])('identifies the default Node through the %s layout', async OperatingMode => {
    expect(await inspect({ OperatingMode })).toMatchObject({
      manager: { status: 'ready', kind: 'nvm-windows', version: '2.0.1' },
      capabilities: { list: { available: true }, install: { available: true }, use: { available: true } },
      installation: { family: 'modern', executableDigest: cli, mode: OperatingMode },
      activeVersion: '22.9.0', activeSource: 'nvm', installedVersions: ['22.9.0'],
    })
  })
  it.each([{ AllowInsecureDownloads: 1 }, { AutoInstallModuleList: ['custom-module'] }])(
    'keeps use available with nonstandard download settings %j', async settings => {
      expect((await inspect(settings)).capabilities).toMatchObject({ install: { available: false }, use: { available: true } })
    },
  )
  it.each(['http://gateway.example:80', 'https://gateway.example:3128/', 'gateway.example:8080'])(
    'permits installation through a configured registry proxy %s', async Proxy => {
      const state = await inspect({ Proxy })
      expect(state).toMatchObject({ conflicts: [], capabilities: { install: { available: true }, use: { available: true } } })
      expect(getDownloadProxy(state.installation)).toBe(new URL(Proxy.includes('://') ? Proxy : 'http://' + Proxy).origin)
      expect(JSON.stringify(state)).not.toContain('gateway.example')
    },
  )
  it('uses the first non-empty address in a legacy registry multi-string', async () => {
    const state = await inspect({ Proxy: ['', '  https://gateway.example:8080  '], ProxyAuth: false, ProxyAuthType: false })
    expect(state).toMatchObject({ conflicts: [], capabilities: { install: { available: true } } })
  })
  it.each([
    [{ Proxy: 'http://user:example-pass@gateway.example' }, '인증'],
    [{ Proxy: 'http://gateway.example', ProxyAuth: true }, '인증'],
    [{ Proxy: 'http://gateway.example', ProxyAuthType: true }, '인증'],
    [{ Proxy: 'file://gateway.example' }, 'HTTP(S)'],
    [{ Proxy: 42 }, 'HTTP(S)'],
  ])('separates unsupported proxies from mirror conflicts without exposing settings', async (preferences, hint) => {
    const state = await inspect(preferences)
    expect(state).toMatchObject({
      conflicts: [{ code: 'proxy', path: null, message: expect.stringContaining(hint) }],
      capabilities: { install: { available: false }, use: { available: true } },
    })
    expect(JSON.stringify(state)).not.toMatch(/gateway\.example|example-pass/)
  })
  it.each(['shim', 'link'] as const)('withholds runtime attribution when the %s proof fails', async broken => {
    expect(await inspect({}, broken)).toMatchObject({ activeSource: null, capabilities: { list: { available: true }, use: { available: false } } })
  })
  it('blocks switching when a command shadows node.exe within the .nodejs directory', async () => {
    expect(await inspect({}, 'command')).toMatchObject({
      activeSource: null, capabilities: { use: { available: false } }, conflicts: [{ code: 'path-priority' }],
    })
  })
  it('permits installation with an existing version and a cleared link-mode default', async () => {
    expect(await inspect({ OperatingMode: 'link', ActiveVersion: '' })).toMatchObject({
      activeVersion: null, activeSource: null, capabilities: { install: { available: true } },
    })
  })
  it('uses a local x86 installation as evidence of a prior install without offering it for x64 use', async () => {
    expect(await inspect({ OperatingMode: 'link', ActiveVersion: '' }, 'x86')).toMatchObject({
      installedVersions: [], activeVersion: null,
      capabilities: { list: { available: true }, install: { available: true } },
    })
  })
  it('does not use a redirected executable as prior-install evidence', async () => {
    expect(await inspect({ OperatingMode: 'link', ActiveVersion: '' }, 'redirected-node')).toMatchObject({
      installedVersions: [], capabilities: { install: { available: true } },
    })
  })
  it.each(['disabled', '  DiSABLED  ', 'NONE', ' off', '0'])('blocks install and link use when revocation is %j', async AuthenticodeRevocation => {
    const state = await inspect({ OperatingMode: 'link', AuthenticodeRevocation })
    expect(state.capabilities).toMatchObject({ list: { available: true }, use: { available: false, reason: expect.stringContaining('인증서') }, install: { available: false } })
  })
  it.each(['cached', ' Cache-Only ', 'wholechain', 'FULL'])('retains authenticated operations for %s', async AuthenticodeRevocation => {
    expect((await inspect({ AuthenticodeRevocation, AllowedSigners: ['OpenJS Foundation'] })).capabilities).toMatchObject({ install: { available: true }, use: { available: true } })
  })
  it('blocks a broadened signing policy for installation and activation', async () => {
    expect((await inspect({ AllowedSigners: ['Other Publisher'], OperatingMode: 'link' })).capabilities).toMatchObject({ list: { available: true }, install: { available: false }, use: { available: false } })
  })
  it.each([
    ['ActiveVersion', 'machine-policy'], ['PreviousActiveVersion', 'user-policy'], ['ActiveVersion', 'machine-preference'],
  ])('prevents a partial activation when %s is controlled by %s', async (key, source) => {
    expect((await inspect({ WriteSources: { [key]: source } })).capabilities).toMatchObject({ install: { available: true }, use: { available: false, reason: expect.stringContaining(key) } })
    expect((await inspect({ WriteSources: { [key]: 'user-preference' } })).capabilities?.use.available).toBe(true)
  })
  it.each(['link', 'shim'])('allows a first ZIP install with no active version in %s mode', async OperatingMode => {
    const state = await inspect({ OperatingMode, ActiveVersion: '', WriteSources: { ActiveVersion: 'machine-policy' } }, 'empty')
    expect(state).toMatchObject({ activeVersion: null, activeSource: null, capabilities: { install: { available: true }, use: { available: false } } })
  })
  it.each(['machine-policy', 'user-policy', 'machine-preference', 'user-preference'])('respects the effective mirror source %s', async source => {
    const state = await inspect({ MirrorNode: ['https://mirror.invalid/'], WriteSources: { MirrorNode: source } })
    expect(state.capabilities?.install.available).toBe(source.endsWith('preference'))
    if (source.endsWith('policy')) expect(() => getDownloadProxy(state.installation)).toThrow()
  })
  it.each(['LocalInstallOnly', 'AirGapped'])('prevents the catalog and ZIP from bypassing %s', async setting => {
    const state = await inspect({ [setting]: 1 })
    expect(state.capabilities).toMatchObject({ install: { available: false }, use: { available: true } })
    expect(() => getDownloadProxy(state.installation)).toThrow()
  })
  it('retains a readable inventory when a helper cannot be opened', async () => {
    expect(await inspect({}, 'helper-read')).toMatchObject({ installedVersions: ['22.9.0'], capabilities: { list: { available: true }, use: { available: false } } })
  })
  it('reports inaccessible version storage as a read failure', async () => {
    expect(await inspect({}, 'list')).toMatchObject({ manager: { version: '2.0.1' }, capabilities: { list: { available: false, reason: expect.any(String) } } })
  })
})
