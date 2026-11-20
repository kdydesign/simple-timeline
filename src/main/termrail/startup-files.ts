import {randomUUID} from 'node:crypto'
import {closeSync, constants, mkdirSync, openSync, rmSync, writeFileSync, fsyncSync} from 'node:fs'
import {open} from 'node:fs/promises'
import {basename, join} from 'node:path'
import {isTermRailEndpoint, type TermRailEndpoint, type TermRailStartupRef} from '../../shared/termrail-ssh'
import type {SecretVault} from '../sharing/secrets'

export interface TermRailStartup {
  username: string
  password: string
  body: string
}

const sourceLimit = 64 * 1024
const formatError = () => Error('시작 파일의 UTF-8 형식과 첫 두 줄의 아이디·비밀번호를 확인하세요.')

function parseSource(text: string): TermRailStartup {
  const normalized = text.replaceAll('\r\n', '\n')
  const headers = /^# workrail-user: ([^\n]+)\n# workrail-password: ([^\n]+)(?:\n|$)/u.exec(normalized)
  if (!headers || /[\r\0]/u.test(normalized)) throw formatError()
  const [, username, password] = headers
  if (username.length > 256 || /[\x00-\x1f\x7f]/u.test(username) || password.length > 4096) throw formatError()
  return {username, password, body: normalized.slice(headers[0].length)}
}

async function readBounded(file: string, limit: number) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) throw Error()
    // One extra byte detects a file growing between stat and read without unbounded allocation.
    const data = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < data.length) {
      const {bytesRead} = await handle.read(data, offset, data.length - offset, null)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== stat.size) throw Error()
    return data.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

export class TermRailStartupFiles {
  private readonly directory: string

  constructor(profile: string, private readonly vault: SecretVault) {
    this.directory = join(profile, 'termrail-startup')
  }

  private file(id: unknown) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id))
      throw Error('잘못된 시작 파일입니다.')
    return join(this.directory, id)
  }

  private async requireProtection() {
    if (!await this.vault.isAsyncEncryptionAvailable()) throw Error()
    if (process.platform === 'linux' && !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(this.vault.getSelectedStorageBackend()))
      throw Error()
  }

  async importFile(source: string, endpoint: TermRailEndpoint, current: () => boolean): Promise<TermRailStartupRef> {
    if (!isTermRailEndpoint(endpoint)) throw Error('시작 파일을 등록할 서버를 확인하세요.')
    const data = await readBounded(source, sourceLimit).catch(() => {throw Error('시작 파일을 읽을 수 없습니다.')})
    let text: string
    try {
      text = new TextDecoder('utf-8', {fatal: true}).decode(data)
    } catch {
      throw formatError()
    } finally {
      data.fill(0)
    }
    parseSource(text)
    const id = randomUUID()
    const file = this.file(id)
    try {
      await this.requireProtection()
      const encrypted = await this.vault.encryptStringAsync(JSON.stringify({id, host: endpoint.host, port: endpoint.port, text}))
      if (!current()) throw Error()
      mkdirSync(this.directory, {recursive: true, mode: 0o700})
      const fd = openSync(file, 'wx', 0o600)
      try {
        try {
          writeFileSync(fd, encrypted)
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
      } catch (error) {
        rmSync(file, {force: true})
        throw error
      }
    } catch {
      throw Error('시작 파일을 보호하여 저장할 수 없습니다.')
    }
    return {id, name: basename(source)}
  }

  async resolve(id: string, endpoint: TermRailEndpoint): Promise<TermRailStartup> {
    try {
      const file = this.file(id)
      await this.requireProtection()
      const ciphertext = await readBounded(file, 1024 * 1024)
      const {result} = await this.vault.decryptStringAsync(ciphertext)
      const record = JSON.parse(result)
      if (record.id !== id || record.host !== endpoint.host || record.port !== endpoint.port ||
          typeof record.text !== 'string' || Buffer.byteLength(record.text) > sourceLimit) throw Error()
      return parseSource(record.text)
    } catch {
      throw Error('이 서버의 시작 파일을 열 수 없습니다. 파일을 다시 등록하세요.')
    }
  }

  discard(id: string) {
    try {
      rmSync(this.file(id), {force: true})
    } catch {
      throw Error('등록한 시작 파일을 삭제할 수 없습니다.')
    }
  }
}
