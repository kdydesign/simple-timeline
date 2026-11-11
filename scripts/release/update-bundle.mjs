import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { load, JSON_SCHEMA } from 'js-yaml'

const GiB = 1024 ** 3, MiB = 1024 ** 2
const basename = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) && !value.includes('..') && !value.endsWith('.') && !/UPDATE-TEST-ONLY|^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)
async function hashFile(path, maximum = GiB) {
  const info = await lstat(path)
  if (!info.isFile() || !info.size || info.size > maximum) throw new Error('Invalid release file or size')
  const sha256 = createHash('sha256'), sha512 = createHash('sha512'); let size = 0
  for await (const chunk of createReadStream(path)) { size += chunk.length; if (size > maximum) throw new Error('Release file too large'); sha256.update(chunk); sha512.update(chunk) }
  if (size !== info.size) throw new Error('Release file changed during build')
  return { size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') }
}
/** Build from electron-builder output only; synthetic lifecycle installers never become distributable ZIPs. */
export async function createUpdateBundle({ directory, manifest: input }) {
  if (input.validationUpdateOnly !== false) throw new Error('Validation fixture cannot produce a production update ZIP')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version) || !/^[a-f0-9]{40}$/.test(input.sourceSha) || input.arch !== 'x64' || input.signed !== false || !basename(input.installer) || !input.installer.endsWith('.exe')) throw new Error('Invalid production release identity')
  const entries = [['installer', input.installer], ['blockmap', input.installer + '.blockmap'], ['metadata', 'latest.yml']]
  try { await lstat(join(directory, 'USER-GUIDE.ko.md')); entries.push(['guide', 'USER-GUIDE.ko.md']) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const files = []
  for (const [id, name] of entries) files.push({ id, name, ...await hashFile(join(directory, name), id === 'metadata' || id === 'guide' ? MiB : GiB) })
  const installer = files[0], latest = load(await readFile(join(directory, 'latest.yml'), 'utf8'), { schema: JSON_SCHEMA })
  if (!latest || (latest.releaseDate !== undefined && typeof latest.releaseDate !== 'string') || Object.keys(latest).some(k => !['version', 'path', 'sha512', 'files', 'releaseDate'].includes(k)) || latest.version !== input.version || latest.path !== installer.name || latest.sha512 !== installer.sha512 || !Array.isArray(latest.files) || latest.files.length !== 1 || Object.keys(latest.files[0] ?? {}).some(k => !['url', 'sha512', 'size'].includes(k)) || latest.files[0]?.url !== installer.name || latest.files[0]?.sha512 !== installer.sha512 || latest.files[0]?.size !== installer.size) throw new Error('Release metadata does not match installer')
  const manifest = { ...input, schemaVersion: 1, appId: 'com.kdydesign.simpletimeline', platform: 'win32', installerType: 'nsis', installScope: 'per-user', sha256: installer.sha256, bytes: installer.size, files }
  await writeFile(join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const manifestHash = await hashFile(join(directory, 'release-manifest.json'), MiB)
  const checksums = files.map(f => `${f.sha256}  ${f.name}\n`).join('') + `${manifestHash.sha256}  release-manifest.json\n`
  const checksumName = installer.name + '.sha256'
  await writeFile(join(directory, checksumName), checksums)
  const names = [...files.map(f => f.name), 'release-manifest.json', checksumName].sort()
  if (files.reduce((sum, f) => sum + f.size, manifestHash.size + Buffer.byteLength(checksums)) > 2 * GiB) throw new Error('Release expansion limit exceeded')
  const zipPath = join(directory, `Planrail-${input.version}-win-x64-${input.sourceSha}-update.zip`), temporary = `${zipPath}.${randomUUID()}.tmp`, zip = new ZipFile()
  try {
    const writing = pipeline(zip.outputStream, createWriteStream(temporary, { flags: 'wx' }))
    zip.on('error', error => zip.outputStream.destroy(error))
    for (const name of names) zip.addFile(join(directory, name), name, { compress: false })
    zip.end(); await writing
    const zipped = await hashFile(temporary)
    await rename(temporary, zipPath)
    await writeFile(zipPath + '.sha256', `${zipped.sha256}  ${zipPath.split(/[\\/]/).pop()}\n`)
    return { zipPath, manifest }
  } finally { await rm(temporary, { force: true }) }
}
