import { describe, expect, it } from 'vitest'
import { selectStandaloneTarget, readMsiResult, type MsiEvidence } from '../../src/main/node-management/standalone'
import { createNodeManagementService, type WindowsNodeAdapter } from '../../src/main/node-management/service'
import type { WindowsDiscovery } from '../../src/main/node-management/discovery'
import { dispatchNodeManagement } from '../../src/main/node-management/ipc-core'

const evidence: MsiEvidence = {
  inspectingUserSid: 'S-1-5-21-111-222-333-1001',
  productCode: '{01234567-89AB-CDEF-0123-456789ABCDEF}', upgradeCode: '{47C07A3A-42EF-4213-A85D-8F5A59077C28}',
  version: '22.9.0', scope: 'machine', name: 'Node.js', publisher: 'Node.js Foundation',
  nodePath: 'C:\\Program Files\\nodejs\\node.exe', componentPath: 'C:\\Program Files\\nodejs\\node.exe',
  registryPath: 'C:\\Program Files\\nodejs', nodeDigest: 'cf5c4dc82434c181171d6bef146d4374742ef2bb89ca31d2ab83ffff210ea1b1',
  officialNodeDigest: 'cf5c4dc82434c181171d6bef146d4374742ef2bb89ca31d2ab83ffff210ea1b1', packageDigest: 'a'.repeat(64), componentId: '{11234567-89AB-CDEF-0123-456789ABCDEF}',
  nodeSignature: true, packageSignature: true, packageSourceVerified: false, packageCode: '{31234567-89AB-CDEF-0123-456789ABCDEF}', protectedLocation: true, x64: true,
}
const missing: WindowsDiscovery = {
  installation: null, manager: { status: 'missing', version: null }, activeVersion: '22.9.0', activeSource: 'standalone', installedVersions: [],
  conflicts: [{ code: 'standalone-node', path: evidence.nodePath, message: 'existing Node' }],
}
function serviceFor(options: { evidence?: () => MsiEvidence[]; outcome?: ReturnType<typeof readMsiResult>; changed?: () => WindowsDiscovery } = {}) {
  let launches = 0
  let removed = false
  const windows: WindowsNodeAdapter = {
    discover: async () => options.changed?.() ?? (removed ? { ...missing, activeVersion: null, activeSource: null, conflicts: [] } : missing),
    inspectStandalone: async () => options.evidence?.() ?? (removed ? [] : [evidence]),
    removeStandalone: async () => { launches++; removed = options.outcome?.status !== 'cancelled'; return options.outcome ?? { status: 'success', msiExitCode: 0 } },
    changeVersion: async () => { throw Error('unexpected') }, installManager: async () => { throw Error('unexpected') },
  }
  return { service: createNodeManagementService({ platform: 'win32', arch: 'x64', windows, loadCatalog: async () => [], changed: () => {} }), launches: () => launches }
}
describe('official MSI identification', () => {
  it('cross-checks ownership and pinned signed executable rather than display name', () => {
    expect(selectStandaloneTarget([evidence], missing)?.productCode).toBe(evidence.productCode)
    for (const patch of [{ nodeDigest: 'b'.repeat(64) }, { packageSignature: false }, { nodeSignature: false }, { protectedLocation: false }, { componentPath: 'C:\\Other\\node.exe' }, { scope: 'user' }, { upgradeCode: '{00000000-0000-0000-0000-000000000000}' }]) {
      expect(selectStandaloneTarget([{ ...evidence, ...patch }], missing)).toBeNull()
    }
  })
  it('accepts a newer official release only with its fetched official digest', () => {
    expect(selectStandaloneTarget([{ ...evidence, version: '24.22.3', nodeDigest: 'c'.repeat(64), officialNodeDigest: 'c'.repeat(64) }], missing)?.version).toBe('24.22.3')
    expect(selectStandaloneTarget([{ ...evidence, version: '24.22.3', nodeDigest: 'c'.repeat(64), officialNodeDigest: '' }], missing)).toBeNull()
  })
  it('refuses multiple products, nvm, shims and an unrelated active executable', () => {
    expect(selectStandaloneTarget([evidence, { ...evidence, productCode: '{21234567-89AB-CDEF-0123-456789ABCDEF}' }], missing)).toBeNull()
    expect(selectStandaloneTarget([evidence], { ...missing, manager: { status: 'ready', version: '1.2.2' } })).toBeNull()
    expect(selectStandaloneTarget([evidence], { ...missing, conflicts: [{ code: 'path-priority', path: 'C:\\shim\\node.cmd', message: 'shim' }] })).toBeNull()
  })
})
describe('removal results and confirmation', () => {
  it.each([[0,'success'],[1602,'cancelled'],[1618,'installer-busy'],[3010,'reboot-required'],[1641,'reboot-required'],[1610,'failed'],[1611,'failed']] as const)('keeps MSI exit %s distinct from bridge errors', (code, status) => {
    expect(readMsiResult(JSON.stringify({ kind: 'msi', exitCode: code }))).toEqual({ status, msiExitCode: code })
  })
  it('does not confuse UAC cancellation or malformed bridge messages with MSI codes', () => {
    expect(readMsiResult('{"kind":"uac-cancelled"}')).toEqual({ status: 'cancelled', msiExitCode: null })
    expect(readMsiResult('')).toEqual({ status: 'unknown', msiExitCode: null })
  })
  it('removes only the displayed snapshot and verifies the resulting environment', async () => {
    const { service, launches } = serviceFor()
    const before = await service.getState()
    expect(before.removal?.status).toBe('available')
    const result = await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })
    expect(result).toMatchObject({ busy: null, error: null, conflicts: [], removal: { status: 'unavailable', msiExitCode: 0 } })
    expect(launches()).toBe(1)
    expect((await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })).error?.code).toBe('confirmation-expired')
  })
  it('invalidates a confirmed target if its identity or manager changes', async () => {
    let changed = false
    const { service, launches } = serviceFor({ evidence: () => [{ ...evidence, packageDigest: changed ? 'b'.repeat(64) : evidence.packageDigest }] })
    const before = await service.getState(); changed = true
    expect((await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })).error?.code).toBe('confirmation-expired')
    expect(launches()).toBe(0)
  })
  it.each([3010, 1641])('holds further mutation pending an observed reboot for %s', async code => {
    const { service } = serviceFor({ outcome: readMsiResult(JSON.stringify({ kind: 'msi', exitCode: code })) })
    const before = await service.getState()
    expect(await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })).toMatchObject({ error: { code: 'reboot-required' }, removal: { rebootRequired: true } })
    expect((await service.installManager()).error?.code).toBe('reboot-required')
  })
  it('keeps residual conflict after reported success and reinspects cancellation', async () => {
    const { service } = serviceFor({ changed: () => missing })
    const before = await service.getState()
    expect((await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })).error?.code).toBe('verification-failed')
    const cancelled = serviceFor({ outcome: { status: 'cancelled', msiExitCode: null } }).service
    const initial = await cancelled.getState()
    expect(await cancelled.removeStandalone({ confirmed: true, confirmationId: initial.removal!.confirmationId! })).toMatchObject({ error: { code: 'cancelled' }, removal: { status: 'available' } })
  })
  it('rejects renderer path, product or command injection at IPC', async () => {
    const service = new Proxy({}, { get() { throw Error('must not dispatch') } }) as never
    for (const input of [{ confirmed: true, confirmationId: 'a'.repeat(64), productCode: evidence.productCode }, { confirmed: false, confirmationId: 'a'.repeat(64) }, { confirmed: true, confirmationId: '../path' }]) {
      expect(await dispatchNodeManagement(service, ['removeStandalone', input], true)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
    }
  })
})

describe('official release integrity evidence', () => {
  it('fetches only exact release hashes and rejects ambiguous metadata and foreign redirects', async () => {
    const { fetchOfficialNodeDigest } = await import('../../src/main/node-management/standalone')
    const digest = 'f'.repeat(64)
    expect(await fetchOfficialNodeDigest(async url => {
      expect(url).toBe('https://nodejs.org/dist/v24.22.3/SHASUMS256.txt')
      return new Response(digest + '  win-x64/node.exe\n')
    }, '24.22.3')).toBe(digest)
    await expect(fetchOfficialNodeDigest(async () => new Response('', { status: 302, headers: { location: 'https://evil.test/list' } }), '24.22.3')).rejects.toThrow()
    await expect(fetchOfficialNodeDigest(async () => new Response((digest + '  win-x64/node.exe\n').repeat(2)), '24.22.3')).rejects.toThrow()
    await expect(fetchOfficialNodeDigest(async () => { throw Error('must not fetch') }, '../../evil')).rejects.toThrow('Invalid official')
  })
})

it('keeps the UAC command below Windows command-line limits and verifies staged worker bytes', async () => {
  const { createMsiRemovalWorker, createMsiRemovalCommand } = await import('../../src/main/node-management/standalone-windows')
  const { createHash } = await import('node:crypto')
  const worker = createMsiRemovalWorker('C:\\Windows\\System32', evidence)
  const digest = createHash('sha256').update(worker).digest('hex')
  const args = createMsiRemovalCommand('C:\\Windows\\System32', 'C:\\Temp\\worker.ps1', digest)
  expect(args.join(' ').length).toBeLessThan(30000)
  expect(() => createMsiRemovalCommand('C:\\Windows\\System32', 'C:\\Temp\\worker.ps1', 'wrong')).toThrow()
  expect(() => createMsiRemovalWorker('C:\\Windows\\System32', { ...evidence, productCode: '/x evil' })).toThrow()
})

it('does not expire confirmation when Windows serializes the same evidence fields in a different order', async () => {
  let reversed = false
  const { service, launches } = serviceFor({ evidence: () => reversed ? [Object.fromEntries(Object.entries(evidence).reverse()) as MsiEvidence] : [evidence] })
  const before = await service.getState()
  reversed = true
  await service.removeStandalone({ confirmed: true, confirmationId: before.removal!.confirmationId! })
  expect(launches()).toBe(1)
})

it('allows a non-owner contender to reinspect and recover after the real owner completes', async () => {
  let blocked = true
  const windows: WindowsNodeAdapter = {
    discover: async () => ({ ...missing, activeSource: null, activeVersion: null, conflicts: [] }),
    acquireMutation: async () => { if (blocked) throw Error('operation-unknown'); return { record: async () => {}, finish: async () => {} } },
    mutationStatus: async () => blocked ? 'operation-unknown' : 'clear',
    changeVersion: async () => { throw Error('unexpected') },
    installManager: async () => ({ status: 'cancelled' }),
  }
  const service = createNodeManagementService({ platform: 'win32', arch: 'x64', windows, changed: () => {}, loadCatalog: async () => [] })
  expect(await service.installManager()).toMatchObject({ busy: null, error: { code: 'operation-unknown' } })
  blocked = false
  expect(await service.getState()).toMatchObject({ busy: null, error: null })
  expect((await service.installManager()).error?.code).toBe('cancelled')
})

it('accepts a stripped cached MSI only with verified signed official package correspondence', () => {
  expect(selectStandaloneTarget([{ ...evidence, packageSignature: false, packageSourceVerified: true }], missing)).not.toBeNull()
  expect(selectStandaloneTarget([{ ...evidence, packageSignature: false, packageSourceVerified: false }], missing)).toBeNull()
  expect(selectStandaloneTarget([{ ...evidence, packageSignature: false, packageSourceVerified: true, protectedLocation: false }], missing)).toBeNull()
})
