import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, it} from 'vitest'
import {TermRailStartupFiles} from '../../src/main/termrail/startup-files'
import type {SecretVault} from '../../src/main/sharing/secrets'

const endpoint = {host: 'node.example', port: 2222}
const text = '\uFEFF# workrail-user: alice\r\n# workrail-password:  pa$()ss \r\ncd /tmp\r\npwd'
let dir: string
let source: string
let store: TermRailStartupFiles
let vault: SecretVault
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'termrail-import-'))
  source = join(dir, 'startup.sh')
  writeFileSync(source, text)
  // Only the operating-system vault needs a stand-in in this unit test.
  const entries = new Map<string, string>()
  vault = {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptStringAsync: async plain => {
      const token = randomUUID()
      entries.set(token, plain)
      return Buffer.from(token)
    },
    decryptStringAsync: async encrypted => {
      const result = entries.get(encrypted.toString())
      if (result === undefined) throw Error(source)
      return {result, shouldReEncrypt: false}
    },
  }
  store = new TermRailStartupFiles(dir, vault)
})
afterEach(() => rmSync(dir, {recursive: true, force: true}))

it('copies a sealed snapshot and returns only its name and reference', async () => {
  const staged = await store.stage(source)
  expect(readdirSync(dir)).toEqual(['startup.sh'])
  rmSync(source)
  await expect(store.bind(staged, endpoint, () => false)).rejects.toThrow()
  expect(readdirSync(dir)).toEqual([])
  const ref = await store.bind(staged, endpoint, () => true)
  expect(ref).toEqual({id: expect.any(String), name: 'startup.sh'})
  const copy = readFileSync(join(dir, 'termrail-startup', ref.id))
  expect(copy.toString()).not.toContain('pa$()ss')
  const reopened = new TermRailStartupFiles(dir, vault)
  expect(await reopened.resolve(ref.id, endpoint)).toEqual({username: 'alice', password: ' pa$()ss ', body: 'cd /tmp\npwd'})
  for (const other of [{...endpoint, host:'other.example'}, {...endpoint, port:22}]) {
    await expect(reopened.resolve(ref.id, other)).rejects.toThrow('서버')
  }
  const swapped = randomUUID()
  writeFileSync(join(dir, 'termrail-startup', swapped), copy)
  await expect(reopened.resolve(swapped, endpoint)).rejects.toThrow()
  reopened.discard(ref.id)
  await expect(reopened.resolve(ref.id, endpoint)).rejects.toThrow()
  expect(() => reopened.discard('../startup.sh')).toThrow()
})

it('opens a file saved by the previous release only for its original endpoint', async () => {
  const id = randomUUID()
  const saved = await vault.encryptStringAsync(JSON.stringify({
    id, host:'legacy.test', port:2222, text:'# workrail-user: example\n# workrail-password: fixture\npwd',
  }))
  mkdirSync(join(dir, 'termrail-startup'))
  writeFileSync(join(dir, 'termrail-startup', id), saved)
  expect(await store.resolve(id, {host:'legacy.test', port:2222})).toEqual({username:'example',password:'fixture',body:'pwd'})
  await expect(store.resolve(id, {host:'legacy.test', port:22})).rejects.toThrow('다시 등록')
})

it.each([
  '\n# workrail-user: alice\n# workrail-password: pass\n',
  '# workrail-user:  \n# workrail-password: pass\n\x00',
  '# workrail-user: alice\n# workrail-password: \n',
  Buffer.from([0xff, 0xfe, 0x61]),
  'x'.repeat(64 * 1024 + 1),
])('rejects malformed or oversized input before writing a copy', async data => {
  writeFileSync(source, data)
  await expect(store.stage(source)).rejects.toThrow()
  expect(readdirSync(dir)).toEqual(['startup.sh'])
})

it('fails closed if the key store is unavailable', async () => {
  vault.isAsyncEncryptionAvailable = async () => false
  await expect(store.stage(source)).rejects.toThrow()
  vault.isAsyncEncryptionAvailable = async () => true
  if (process.platform === 'linux') {
    vault.getSelectedStorageBackend = () => 'basic_text'
    await expect(store.stage(source)).rejects.toThrow()
    vault.getSelectedStorageBackend = () => 'gnome_libsecret'
  }
  expect(readdirSync(dir)).toEqual(['startup.sh'])
})

it('suppresses paths and private details from underlying errors', async () => {
  vault.encryptStringAsync = async () => { throw Error('private fixture details') }
  await expect(store.stage(source)).rejects.toThrow(/^시작 파일을 보호하여 저장할 수 없습니다\.$/)
  await expect(store.stage(join(dir, 'private.sh'))).rejects.toThrow(/^시작 파일을 읽을 수 없습니다\.$/)
})
