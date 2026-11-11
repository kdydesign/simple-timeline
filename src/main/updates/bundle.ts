import { createHash } from 'node:crypto'
import { createWriteStream, constants } from 'node:fs'
import { lstat, open, readFile, readdir, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open as openZip, type ZipFile, type Entry } from 'yauzl'
import { load, JSON_SCHEMA } from 'js-yaml'
import { UPDATE_APP_ID, compareStableVersions, type UpdateFile, type UpdateManifest, type UpdateRelease } from '../../shared/updates'

export const UPDATE_LIMITS = Object.freeze({ zip: 1024 ** 3, installer: 1024 ** 3, expanded: 2 * 1024 ** 3, entries: 16, metadata: 1024 ** 2 })
const metadataNames = new Set(['latest.yml', 'release-manifest.json', 'USER-GUIDE.ko.md'])
export function isUpdateBasename(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value) && !value.includes('..') && !/UPDATE-TEST-ONLY/i.test(value)
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid update object')
  return value as Record<string, unknown>
}
export function parseUpdateManifest(value: unknown): UpdateManifest {
  const m = object(value)
  if (m.schemaVersion !== 1 || m.appId !== UPDATE_APP_ID || m.platform !== 'win32' || m.arch !== 'x64' || m.installerType !== 'nsis' || m.installScope !== 'per-user' || m.signed !== false || m.validationUpdateOnly !== false) throw new Error('Unsupported update manifest or validation fixture')
  if (typeof m.version !== 'string' || typeof m.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(m.sourceSha)) throw new Error('Invalid release identity')
  compareStableVersions(m.version, m.version)
  if (!Array.isArray(m.files) || m.files.length < 3 || m.files.length > 4) throw new Error('Invalid update file list')
  const ids = new Set(), names = new Set()
  const files = m.files.map(raw => {
    const f = object(raw)
    if (!['installer', 'blockmap', 'metadata', 'guide'].includes(String(f.id)) || ids.has(f.id) || !isUpdateBasename(f.name) || names.has(f.name.toLowerCase())) throw new Error('Invalid or duplicate file identity')
    if (!Number.isSafeInteger(f.size) || Number(f.size) <= 0 || Number(f.size) > (f.id === 'installer' || f.id === 'blockmap' ? UPDATE_LIMITS.installer : UPDATE_LIMITS.metadata)) throw new Error('Invalid file length')
    if (typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256) || typeof f.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(f.sha512)) throw new Error('Invalid file hash')
    ids.add(f.id); names.add(f.name.toLowerCase())
    return { id: f.id, name: f.name, size: f.size, sha256: f.sha256, sha512: f.sha512 } as UpdateFile
  })
  const installer = files.find(f => f.id === 'installer'), blockmap = files.find(f => f.id === 'blockmap'), metadata = files.find(f => f.id === 'metadata'), guide = files.find(f => f.id === 'guide')
  if (!installer || !/\.exe$/.test(installer.name) || blockmap?.name !== installer.name + '.blockmap' || metadata?.name !== 'latest.yml' || (guide && guide.name !== 'USER-GUIDE.ko.md')) throw new Error('Invalid required update files')
  return { schemaVersion: 1, appId: UPDATE_APP_ID, version: m.version, platform: 'win32', arch: 'x64', installerType: 'nsis', installScope: 'per-user', sourceSha: m.sourceSha, signed: false, validationUpdateOnly: false, files }
}
export function validateUpdateMetadata(text: string, manifest: UpdateManifest): void {
  if (Buffer.byteLength(text) > UPDATE_LIMITS.metadata) throw new Error('Metadata too large')
  const metadata = object(load(text, { schema: JSON_SCHEMA }))
  if (Object.keys(metadata).some(k => !['version', 'files', 'path', 'sha512', 'releaseDate'].includes(k))) throw new Error('Unsupported update metadata')
  const installer = manifest.files.find(f => f.id === 'installer')!
  if (metadata.version !== manifest.version || metadata.path !== installer.name || metadata.sha512 !== installer.sha512 || !Array.isArray(metadata.files) || metadata.files.length !== 1) throw new Error('Update metadata mismatch')
  const file = object(metadata.files[0])
  if (Object.keys(file).some(k => !['url', 'sha512', 'size'].includes(k)) || file.url !== installer.name || file.sha512 !== installer.sha512 || file.size !== installer.size || (metadata.releaseDate !== undefined && typeof metadata.releaseDate !== 'string')) throw new Error('Update metadata file mismatch')
}
export async function hashUpdateFile(path: string, maxBytes: number = UPDATE_LIMITS.installer): Promise<{ size: number; sha256: string; sha512: string }> {
  const info = await lstat(path)
  if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid update file or size')
  const sha256 = createHash('sha256'), sha512 = createHash('sha512'); let size = 0
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  const stream = handle.createReadStream()
  for await (const bytes of stream) { size += bytes.length; if (size > maxBytes) { stream.destroy(); throw new Error('Update file too large') } sha256.update(bytes); sha512.update(bytes) }
  if (size !== info.size) throw new Error('Update file length changed')
  return { size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') }
}
export async function validateBundleDirectory(directory: string): Promise<UpdateRelease> {
  const directoryInfo = await lstat(directory)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid bundle directory')
  const manifestPath = join(directory, 'release-manifest.json')
  await hashUpdateFile(manifestPath, UPDATE_LIMITS.metadata)
  const manifest = parseUpdateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
  const checksumName = manifest.files.find(f => f.id === 'installer')!.name + '.sha256'
  const expected = [...manifest.files.map(f => f.name), 'release-manifest.json', checksumName].sort()
  const names = (await readdir(directory)).sort()
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('Unexpected or missing bundle files')
  const hashes = new Map<string, Awaited<ReturnType<typeof hashUpdateFile>>>()
  for (const name of names) hashes.set(name, await hashUpdateFile(join(directory, name), metadataNames.has(name) || name.endsWith('.sha256') ? UPDATE_LIMITS.metadata : UPDATE_LIMITS.installer))
  for (const f of manifest.files) { const h = hashes.get(f.name)!; if (h.size !== f.size || h.sha256 !== f.sha256 || h.sha512 !== f.sha512) throw new Error('Update file hash or length mismatch') }
  validateUpdateMetadata(await readFile(join(directory, 'latest.yml'), 'utf8'), manifest)
  const checksums = (await readFile(join(directory, checksumName), 'utf8')).trimEnd().split('\n'), checked = new Set<string>()
  for (const line of checksums) { const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line); if (!match || match[2] === checksumName || checked.has(match[2]) || hashes.get(match[2])?.sha256 !== match[1]) throw new Error('Invalid checksum file'); checked.add(match[2]) }
  if (checked.size !== names.length - 1) throw new Error('Incomplete checksum file')
  const releaseId = createHash('sha256').update(JSON.stringify(names.map(name => [name, hashes.get(name)]))).digest('hex')
  return { releaseId, manifest }
}
export async function extractUpdateBundle(zipPath: string, destination: string): Promise<UpdateRelease> {
  const file = await lstat(zipPath)
  if (!file.isFile() || file.size <= 0 || file.size > UPDATE_LIMITS.zip) throw new Error('Invalid update ZIP size')
  const zip = await new Promise<ZipFile>((resolve, reject) => openZip(zipPath, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false }, (error, value) => error || !value ? reject(error ?? new Error('Invalid ZIP')) : resolve(value)))
  const active: { stream: import('node:stream').Readable | null } = { stream: null }
  try {
    if (zip.entryCount > UPDATE_LIMITS.entries) throw new Error('Too many ZIP entries')
    const disk = await statfs(destination, { bigint: true }); let available = disk.bavail * disk.bsize, expanded = 0, count = 0
    const names = new Set<string>()
    await new Promise<void>((resolve, reject) => {
      zip.on('error', error => { active.stream?.destroy(error); reject(error) }); zip.on('end', resolve)
      zip.on('entry', (entry: Entry) => { void (async () => {
        const name = entry.fileName, type = (entry.externalFileAttributes >>> 16) & 0xf000
        if (++count > UPDATE_LIMITS.entries || !isUpdateBasename(name) || names.has(name.toLowerCase()) || (type !== 0 && type !== 0x8000) || (entry.generalPurposeBitFlag & 1) !== 0 || (entry.externalFileAttributes & 0x10) !== 0) throw new Error('Unsafe or duplicate ZIP entry')
        if (!metadataNames.has(name) && !/\.exe(?:\.blockmap|\.sha256)?$/.test(name)) throw new Error('Unexpected ZIP entry')
        names.add(name.toLowerCase())
        const max = metadataNames.has(name) || name.endsWith('.sha256') ? UPDATE_LIMITS.metadata : UPDATE_LIMITS.installer
        expanded += entry.uncompressedSize
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > max || expanded > UPDATE_LIMITS.expanded || BigInt(entry.uncompressedSize) > available) throw new Error('ZIP expansion limit or insufficient disk space')
        available -= BigInt(entry.uncompressedSize)
        const input = await new Promise<import('node:stream').Readable>((res, rej) => zip.openReadStream(entry, (error, stream) => error || !stream ? rej(error ?? new Error('Invalid ZIP stream')) : res(stream)))
        active.stream = input; let size = 0
        const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) { size += chunk.length; callback(size > max || size > entry.uncompressedSize ? new Error('ZIP expansion limit') : null, chunk) } })
        await pipeline(input, limit, createWriteStream(join(destination, name), { flags: 'wx', mode: 0o600 }))
        active.stream = null
        if (size !== entry.uncompressedSize) throw new Error('Truncated ZIP entry')
        zip.readEntry()
      })().catch(reject) })
      zip.readEntry()
    })
    return await validateBundleDirectory(destination)
  } finally { active.stream?.destroy(); zip.close() }
}
