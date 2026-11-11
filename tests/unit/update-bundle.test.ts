import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { UpdateCatalog } from '../../src/main/updates/catalog'
import { compareStableVersions } from '../../src/shared/updates'
import { createUpdateService } from '../../src/main/updates/service'
const { ZipFile } = createRequire(import.meta.url)('yazl')
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
async function root() { const p = await mkdtemp(join(tmpdir(), 'planrail-update-')); roots.push(p); return p }
const sha = 'a'.repeat(40)
function digest(b: Buffer, algorithm: string, encoding: 'hex' | 'base64') { return createHash(algorithm).update(b).digest(encoding) }
async function bundle(dir: string, options: { version?: string; content?: string; mutate?: (files: Map<string, Buffer>, manifest: any) => void; extra?: [string, Buffer][] } = {}) {
  const version = options.version ?? '0.8.0', name = `Planrail-${version}.exe`, exe = Buffer.from(options.content ?? 'MZ test installer'), block = Buffer.from('blockmap')
  const metadata = Buffer.from(`version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${digest(exe, 'sha512', 'base64')}\n    size: ${exe.length}\npath: ${name}\nsha512: ${digest(exe, 'sha512', 'base64')}\nreleaseDate: '2026-11-11T00:00:00.000Z'\n`)
  const files = new Map<string, Buffer>([[name, exe], [name + '.blockmap', block], ['latest.yml', metadata]])
  const manifest = { schemaVersion: 1, appId: 'com.kdydesign.simpletimeline', version, platform: 'win32', arch: 'x64', installerType: 'nsis', installScope: 'per-user', sourceSha: sha, signed: false, validationUpdateOnly: false, files: [...files].map(([name, bytes], i) => ({ id: ['installer', 'blockmap', 'metadata'][i], name, size: bytes.length, sha256: digest(bytes, 'sha256', 'hex'), sha512: digest(bytes, 'sha512', 'base64') })) }
  options.mutate?.(files, manifest)
  files.set('release-manifest.json', Buffer.from(JSON.stringify(manifest)))
  files.set(name + '.sha256', Buffer.from([...files].map(([n, b]) => `${digest(b, 'sha256', 'hex')}  ${n}\n`).join('')))
  const zip = new ZipFile(), chunks: Buffer[] = []
  const complete = new Promise<Buffer>((resolve, reject) => { zip.outputStream.on('data', (b: Buffer) => chunks.push(b)); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))); zip.outputStream.on('error', reject) })
  for (const [n, bytes] of [...files, ...(options.extra ?? [])]) zip.addBuffer(bytes, n)
  zip.end()
  const path = join(dir, `bundle-${Math.random()}.zip`); await writeFile(path, await complete); return path
}
async function setup() { const dir = await root(); return { dir, catalog: await UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha }) } }
describe('immutable update bundles', () => {
  it.each(['version', 'source'] as const)('reports host %s mismatch through the service and preserves the active publication', async mismatch => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); const published = await catalog.publish()
    let activeCatalog = catalog
    if (mismatch === 'version') await catalog.importBundle(await bundle(dir, { version: '0.9.0' }))
    else {
      // A retained current release can outlive a manual host upgrade.
      activeCatalog = await UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: 'b'.repeat(40) })
    }
    const before = activeCatalog.status().publication
    const service = await createUpdateService({ root: join(dir, 'member-state'), version: '0.8.0', catalog: async () => activeCatalog, install: async () => 'dirty' })
    try {
      await service.setSharing({ role: 'host', connected: true }); await service.publish()
      expect(service.getState()).toMatchObject({ error: 'host-mismatch', host: { currentVersion: '0.8.0', candidateVersion: mismatch === 'version' ? '0.9.0' : null, publishing: mismatch === 'version' } })
      expect(activeCatalog.status().publication).toEqual(before)
      if (mismatch === 'version') expect(before).toEqual(published)
      await expect(activeCatalog.publish()).rejects.toMatchObject({ code: 'HOST_MISMATCH' })
    } finally { await service.dispose() }
  })
  it('imports privately, publishes explicitly, serves verified files and restores publication', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); expect(catalog.status().publication).toBeNull()
    const publication = await catalog.publish(); expect(publication.manifest.version).toBe('0.8.0')
    const lease = await catalog.readFile(publication.releaseId, 'installer'); const chunks: Buffer[] = []
    for await (const chunk of lease.stream) chunks.push(chunk); lease.release()
    expect(Buffer.concat(chunks).toString()).toBe('MZ test installer')
    const restored = await UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha })
    expect(restored.status().publication?.publicationId).toBe(publication.publicationId)
  })
  it.each(['hash', 'length', 'fixture', 'appId', 'arch', 'scope', 'prerelease', 'yaml-url', 'extra', 'duplicate', 'expansion', 'symlink'])('rejects %s without replacing the active release', async kind => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); const before = await catalog.publish()
    const path = await bundle(dir, { mutate(files, m) {
      if (kind === 'hash') m.files[0].sha256 = '0'.repeat(64)
      if (kind === 'length') m.files[0].size++
      if (kind === 'fixture') m.validationUpdateOnly = true
      if (kind === 'appId') m.appId = 'other.app'
      if (kind === 'arch') m.arch = 'arm64'
      if (kind === 'scope') m.installScope = 'per-machine'
      if (kind === 'prerelease') m.version = '0.8.0-beta.1'
      if (kind === 'yaml-url') files.set('latest.yml', Buffer.from('version: 0.8.0\npath: https://attacker/installer.exe'))
    }, extra: kind === 'extra' ? [['unknown.txt', Buffer.from('x')]] : kind === 'duplicate' ? [['LATEST.YML', Buffer.from('x')]] : undefined })
    if (kind === 'expansion' || kind === 'symlink') { const b = await readFile(path); const i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); if (kind === 'expansion') b.writeUInt32LE(0x40000001, i + 24); else b.writeUInt32LE((0xa1ff << 16) >>> 0, i + 38); await writeFile(path, b) }
    await expect(catalog.importBundle(path)).rejects.toThrow()
    expect(catalog.status().publication).toEqual(before)
  })
  it('rejects traversal and Windows path aliases', async () => {
    for (const bad of ['../bad.exe', 'C:/bad.exe', 'foo\\bad.exe']) {
      const { dir, catalog } = await setup(), p = await bundle(dir, { extra: [['abc_bad.exe', Buffer.from('x')]] }); const bytes = await readFile(p)
      // Equal-width mutation bypasses the writer's own path defenses.
      const replacement = bad.padEnd(11, 'x'); for (let offset = bytes.indexOf('abc_bad.exe'); offset !== -1; offset = bytes.indexOf('abc_bad.exe', offset + 11)) bytes.write(replacement, offset)
      await writeFile(p, bytes); await expect(catalog.importBundle(p)).rejects.toThrow()
    }
  })
  it('remembers immutable version fingerprints after withdrawal and restart', async () => {
    const { dir, catalog } = await setup(), zip = await bundle(dir); await catalog.importBundle(zip); const before = await catalog.publish()
    await catalog.importBundle(zip); expect(catalog.status().publication).toEqual(before)
    await catalog.withdraw(); expect(catalog.status().publication).toBeNull(); expect(catalog.status().current?.manifest.version).toBe('0.8.0')
    await expect(catalog.importBundle(await bundle(dir, { content: 'changed installer' }))).rejects.toThrow(/immutable/i)
    expect((await catalog.publish()).publicationId).not.toBe(before.publicationId)
  })
  it('refuses publishing a different host version or source and suspends it on changed host startup', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir, { version: '0.9.0' })); await expect(catalog.publish()).rejects.toThrow(/host/i)
    await catalog.importBundle(await bundle(dir)); await catalog.publish()
    const reopened = await UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: 'b'.repeat(40) })
    expect(reopened.status().publication).toBeNull(); await expect(reopened.publish()).rejects.toThrow(/host/i)
  })
  it('fails closed on corrupt catalog or missing registered files', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); await catalog.publish(); await rm(join(dir, 'updates', '0.8.0', 'Planrail-0.8.0.exe'))
    await expect(UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha })).rejects.toThrow()
    await writeFile(join(dir, 'updates', 'catalog.json'), '{invalid'); await expect(UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha })).rejects.toThrow()
  })
  it('does not publish after catalog write failure', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); await rm(join(dir, 'updates', 'catalog.json')); await mkdir(join(dir, 'updates', 'catalog.json'))
    await expect(catalog.publish()).rejects.toThrow(); expect(catalog.status().publication).toBeNull()
  })
  it('refuses new reads after withdrawal while an existing lease remains readable', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); const p = await catalog.publish()
    const lease = await catalog.readFile(p.releaseId, 'installer'); await catalog.withdraw()
    await expect(catalog.readFile(p.releaseId, 'installer')).rejects.toThrow(/published/)
    const chunks: Buffer[] = []; for await (const chunk of lease.stream) chunks.push(chunk)
    expect(Buffer.concat(chunks).toString()).toBe('MZ test installer'); lease.release()
    await expect(catalog.readFile('../../outside', 'installer')).rejects.toThrow()
  })
  it('retains only current and candidate and remembers removed version fingerprints', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); await catalog.publish()
    await catalog.importBundle(await bundle(dir, { version: '0.9.0' })); await catalog.importBundle(await bundle(dir, { version: '0.10.0' }))
    expect((await readdir(join(dir, 'updates'))).sort()).toEqual(['0.10.0', '0.8.0', 'catalog.json'])
    const reopened = await UpdateCatalog.open({ root: join(dir, 'updates'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha })
    await expect(reopened.importBundle(await bundle(dir, { version: '0.9.0', content: 'different rebuilt installer' }))).rejects.toThrow(/immutable/i)
  })
  it('bounds ZIP entry counts and metadata expansion before registering', async () => {
    const { dir, catalog } = await setup()
    const many = await bundle(dir, { extra: Array.from({ length: 12 }, (_, i) => [`extra${i}.exe`, Buffer.from('x')] as [string, Buffer]) })
    await expect(catalog.importBundle(many)).rejects.toThrow(/entries/i)
    const metadata = await bundle(dir, { extra: [['USER-GUIDE.ko.md', Buffer.alloc(1024 ** 2 + 1)]] })
    await expect(catalog.importBundle(metadata)).rejects.toThrow(/expansion/i)
    expect(catalog.status().candidate).toBeNull()
  })
  it('accepts the actual CI ZIP writer output through the production importer', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir))
    const { createUpdateBundle } = await import('../../scripts/release/update-bundle.mjs')
    const output = join(dir, 'updates', '0.8.0')
    const { zipPath } = await createUpdateBundle({ directory: output, manifest: { version: '0.8.0', arch: 'x64', installer: 'Planrail-0.8.0.exe', sourceSha: sha, signed: false, validationUpdateOnly: false } })
    const consumer = await UpdateCatalog.open({ root: join(dir, 'consumer'), hostId: 'host-1', hostVersion: '0.8.0', hostSourceSha: sha })
    await consumer.importBundle(zipPath); expect((await consumer.publish()).manifest.version).toBe('0.8.0')
  })
  it('removes completed but unregistered files when the catalog commit fails', async () => {
    const { dir, catalog } = await setup(); await catalog.importBundle(await bundle(dir)); const publication = await catalog.publish()
    await rm(join(dir, 'updates', 'catalog.json')); await mkdir(join(dir, 'updates', 'catalog.json'))
    await expect(catalog.importBundle(await bundle(dir, { version: '0.9.0' }))).rejects.toThrow()
    expect(catalog.status().publication).toEqual(publication)
    expect(await readdir(join(dir, 'updates'))).not.toContain('0.9.0')
  })
  it('lets reselecting the current ZIP replace an incompatible candidate', async () => {
    const { dir, catalog } = await setup(), zip = await bundle(dir); await catalog.importBundle(zip); await catalog.publish()
    await catalog.importBundle(await bundle(dir, { version: '0.9.0' })); await expect(catalog.publish()).rejects.toThrow(/host/i)
    await catalog.importBundle(zip)
    expect((await catalog.publish()).manifest.version).toBe('0.8.0')
    expect(await readdir(join(dir, 'updates'))).not.toContain('0.9.0')
  })
  it('orders stable numeric versions and rejects ambiguous versions', () => {
    expect(compareStableVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareStableVersions('0.8.0', '0.8.0')).toBe(0)
    expect(() => compareStableVersions('01.0.0', '1.0.0')).toThrow()
  })
})
