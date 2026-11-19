import { on } from 'node:events'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'
import { isNodeVersion } from '../../shared/node-management'
import { isExplorerComponent } from './windows-probe'

const MiB = 1024 ** 2
const requiredNpmFiles = ['npm.cmd', 'node_modules/npm/package.json', 'node_modules/npm/bin/npm-cli.js']
const unsafeZip = () => new Error('공식 Node ZIP의 경로, 파일 속성 또는 크기가 올바르지 않습니다.')

async function checkedTarget(root: string, version: string) {
  if (!isNodeVersion(version) || !isAbsolute(root) || root.split(/[\\/]/).includes('..')) throw unsafeZip()
  let ancestor = normalize(root)
  for (;;) {
    const info = await lstat(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('nvm 저장 경로에 링크 또는 일반 디렉터리가 아닌 항목이 있습니다.')
    const parent = dirname(ancestor)
    if (ancestor === parent) break
    ancestor = parent
  }
  return join(root, 'v' + version)
}

async function inspectDirectory(target: string, existingPackage = true): Promise<'absent' | 'complete' | 'incomplete'> {
  try {
    if (!(await lstat(target)).isDirectory()) return 'incomplete'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    throw error
  }
  try {
    const primary = await lstat(join(target, 'node.exe')).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    const executable = !primary && existingPackage ? 'node64.exe' : 'node.exe'
    for (const name of [executable, ...requiredNpmFiles]) {
      let path = target
      const parts = name.split('/')
      for (const [index, part] of parts.entries()) {
        path = join(path, part)
        const info = await lstat(path)
        if (index === parts.length - 1 ? !info.isFile() || info.size === 0 : !info.isDirectory()) return 'incomplete'
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'incomplete'
    throw error
  }
  return 'complete'
}

export async function inspectNodeZipInstallation(root: string, version: string) {
  return inspectDirectory(await checkedTarget(root, version))
}

function validComponent(name: string) {
  return isExplorerComponent(name) && name.length <= 255 && !/[^\x20-\x7e]|~[0-9]/.test(name)
}

async function* readEntries(zip: ZipFile): AsyncGenerator<Entry> {
  if (zip.entryCount > 32_768) throw unsafeZip()
  const entries = on(zip, 'entry', { close: ['end'] })
  zip.readEntry()
  for await (const [entry] of entries) {
    yield entry as Entry
    zip.readEntry()
  }
}

async function extract(archive: Buffer, version: string, staging: string) {
  if (!archive.length || archive.length > 256 * MiB) throw unsafeZip()
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    fromBuffer(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => error ? reject(error) : resolve(zip)))
  try {
    let total = 0
    const prefix = `node-v${version}-win-x64/`
    const paths = new Map<string, { name: string; directory: boolean }>()
    const explicit = new Set<string>()
    for await (const entry of readEntries(zip)) {
      const directory = entry.fileName.endsWith('/')
      const mode = (entry.externalFileAttributes >>> 16) & 0xf000
      if (!entry.fileName.startsWith(prefix) || entry.fileName.length > 1024 || entry.isEncrypted()
        || (entry.externalFileAttributes & 0x400) || ((entry.externalFileAttributes & 0x10) && !directory)
        || (mode && mode !== (directory ? 0x4000 : 0x8000))
        || (directory && entry.uncompressedSize !== 0)) throw unsafeZip()
      if (explicit.has(entry.fileName)) throw unsafeZip()
      explicit.add(entry.fileName)
      if (entry.fileName === prefix) continue
      const name = entry.fileName.slice(prefix.length, directory ? -1 : undefined)
      const parts = name.split('/')
      if (parts.length > 48 || !parts.every(validComponent)) throw unsafeZip()
      let relative = ''
      for (const [index, part] of parts.entries()) {
        relative = relative ? relative + '/' + part : part
        const isDir = directory || index < parts.length - 1
        const key = relative.toLowerCase()
        const known = paths.get(key)
        if (known) {
          if (known.name !== relative || known.directory !== isDir) throw unsafeZip()
        } else {
          paths.set(key, { name: relative, directory: isDir })
          if (paths.size > 65_536) throw unsafeZip()
          if (isDir) await mkdir(join(staging, relative), { mode: 0o700 })
        }
      }
      if (directory) continue
      total += entry.uncompressedSize
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > 256 * MiB || total > 1024 * MiB) throw unsafeZip()
      const stream = await new Promise<Readable>((resolve, reject) =>
        zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)))
      let size = 0
      let checksum = 0
      const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > entry.uncompressedSize) { callback(unsafeZip()); return }
        checksum = crc32(chunk, checksum)
        callback(null, chunk)
      } })
      await pipeline(stream, verify, createWriteStream(join(staging, name), { flags: 'wx', mode: 0o600 }))
      if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw unsafeZip()
    }
  } finally { zip.close() }
}

export class IncompleteNodeInstallationError extends Error {
  readonly path: string
  constructor(target: string) {
    super(`기존 설치 폴더가 불완전합니다. 파일을 확인해 주세요. ${target}`)
    this.name = 'IncompleteNodeInstallationError'
    this.path = target
  }
}

interface NodeZipInstallation {
  root: string
  version: string
  archive: Buffer
  beforePublish?: () => Promise<void>
}
export async function installVerifiedNodeZip({ root, version, archive, beforePublish }: NodeZipInstallation): Promise<'installed' | 'already-installed'> {
  const target = await checkedTarget(root, version)
  const checkExisting = async () => {
    const state = await inspectDirectory(target)
    if (state === 'incomplete') throw new IncompleteNodeInstallationError(target)
    return state === 'complete'
  }
  if (await checkExisting()) return 'already-installed'
  const staging = await mkdtemp(join(root, '.workrail-node-'))
  let published = false
  try {
    await extract(archive, version, staging)
    if (await inspectDirectory(staging, false) !== 'complete') throw new Error('Node ZIP에서 node.exe 또는 npm 구성을 확인할 수 없습니다.')
    await beforePublish?.()
    if (await checkExisting()) return 'already-installed'
    try {
      await rename(staging, target)
    } catch (error) {
      // Windows refuses to replace an existing directory. Reconcile a concurrent install.
      if (await checkExisting()) return 'already-installed'
      throw error
    }
    published = true
    return 'installed'
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true })
  }
}
