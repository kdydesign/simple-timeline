import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { buffer } from 'node:stream/consumers'
import { IncompleteNodeInstallationError, installVerifiedNodeZip, inspectNodeZipInstallation } from '../../src/main/node-management/zip-install'

const { ZipFile } = createRequire(import.meta.url)('yazl')
const version = '22.13.1'
const prefix = `node-v${version}-win-x64/`
const files = ['node.exe', 'npm.cmd', 'node_modules/npm/package.json', 'node_modules/npm/bin/npm-cli.js']
let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'workrail-zip-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function fixture(names = files, link = '') {
  const zip = new ZipFile()
  for (const name of names) zip.addBuffer(Buffer.from('fixture'), prefix + name, { mode: name === link ? 0o120777 : 0o100644 })
  const content = buffer(zip.outputStream)
  zip.end()
  return content
}
const install = (archive: Buffer) => installVerifiedNodeZip({ root, version, archive })

it('strips the official directory and publishes a complete distribution exactly once', async () => {
  const archive = await fixture()
  expect(await inspectNodeZipInstallation(root, version)).toBe('absent')
  expect(await install(archive)).toBe('installed')
  expect(await inspectNodeZipInstallation(root, version)).toBe('complete')
  expect(await install(archive)).toBe('already-installed')
  expect(await readdir(root)).toEqual(['v' + version])
  expect(await readFile(join(root, 'v' + version, 'node.exe'), 'utf8')).toBe('fixture')
})

it.each(['node.EXE', 'NUL.txt', 'node.exe:secret', 'extra.', 'some/Link'])('rejects unsafe entry %s and cleans staging', async name => {
  await expect(install(await fixture([...files, name], 'some/Link'))).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
})

it('rejects a distribution missing npm and preserves an existing incomplete folder', async () => {
  await expect(install(await fixture(['node.exe']))).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
  const target = join(root, 'v' + version)
  await mkdir(target)
  await writeFile(join(target, 'node.exe'), 'original')
  expect(await inspectNodeZipInstallation(root, version)).toBe('incomplete')
  await expect(install(await fixture())).rejects.toBeInstanceOf(IncompleteNodeInstallationError)
  await expect(install(await fixture())).rejects.toMatchObject({ path: target })
  expect(await readFile(join(target, 'node.exe'), 'utf8')).toBe('original')
})

it('preserves a junction in the target path', async () => {
  const other = join(root, 'other')
  await mkdir(other)
  await symlink(other, join(root, 'v' + version), 'junction')
  await expect(install(await fixture())).rejects.toThrow()
  expect(await readdir(other)).toEqual([])
})

it('refuses an archive for a different release', async () => {
  await expect(installVerifiedNodeZip({ root, version: '22.13.2', archive: await fixture() })).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
})

it.each(['reparse', 'expansion', 'parent', 'checksum'])('rejects invalid %s metadata and removes its private staging', async kind => {
  const archive = await fixture([...files, 'extra/xx/file'])
  const header = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  expect(header).toBeGreaterThan(0)
  if (kind === 'reparse') archive.writeUInt32LE((archive.readUInt32LE(header + 38) | 0x400) >>> 0, header + 38)
  if (kind === 'expansion') archive.writeUInt32LE(0x20000000, header + 24)
  if (kind === 'parent') archive.write('..', header + 46 + prefix.length + 'extra/'.length)
  if (kind === 'checksum') archive.writeUInt32LE(0, header + 16)
  await expect(install(archive)).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
})

it('reconciles concurrent publishes without replacing the completed installation', async () => {
  const archive = await fixture()
  const results = await Promise.all([install(archive), install(archive)])
  expect(results.sort()).toEqual(['already-installed', 'installed'])
  expect(await readdir(root)).toEqual(['v' + version])
})

it('checks the environment after extraction and abandons publication if the check fails', async () => {
  const archive = await fixture()
  const beforePublish = async () => {
    const [staging] = await readdir(root)
    expect(staging).toMatch(/^\.workrail-node-/)
    expect(await readFile(join(root, staging, 'node.exe'), 'utf8')).toBe('fixture')
    throw new Error('environment changed')
  }
  await expect(installVerifiedNodeZip({ root, version, archive, beforePublish })).rejects.toThrow('environment changed')
  expect(await readdir(root)).toEqual([])
})

it('preserves an existing complete x64 package using the classic node64.exe layout', async () => {
  const archive = await fixture()
  await install(archive)
  const { rename } = await import('node:fs/promises')
  await rename(join(root, 'v' + version, 'node.exe'), join(root, 'v' + version, 'node64.exe'))
  expect(await inspectNodeZipInstallation(root, version)).toBe('complete')
  expect(await install(archive)).toBe('already-installed')
})
