import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { TermRailEndpoint } from '../../shared/termrail-ssh'

function readPins(file: string): Map<string, string> {
  try {
    if (statSync(file).size > 1024 * 1024) throw new Error()
    const entries: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(entries) || entries.length > 4096 || entries.some(entry =>
      !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
      typeof entry[1] !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(entry[1])
    )) throw new Error()
    return new Map(entries)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw new Error('저장된 호스트 키를 읽을 수 없습니다.')
  }
}

export class SshHostKeys {
  private readonly address: string

  constructor(private readonly file: string, endpoint: TermRailEndpoint) {
    this.address = `[${endpoint.host.toLowerCase()}]:${endpoint.port}`
  }

  get() {
    return readPins(this.file).get(this.address)
  }

  approve(fingerprint: string, previous: string | undefined) {
    const pins = readPins(this.file)
    const current = pins.get(this.address)
    if (current === fingerprint) return
    if (current !== previous) throw new Error('저장된 호스트 키가 바뀌었습니다. 다시 연결해 확인하세요.')
    pins.set(this.address, fingerprint)
    const json = JSON.stringify([...pins])
    if (pins.size > 4096 || Buffer.byteLength(json) > 1024 * 1024)
      throw new Error('호스트 키 저장 공간이 가득 찼습니다.')
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, json, { flag: 'wx', mode: 0o600, flush: true })
      renameSync(temporary, this.file)
    } catch {
      throw new Error('호스트 키를 저장할 수 없습니다.')
    } finally {
      rmSync(temporary, { force: true })
    }
  }
}
