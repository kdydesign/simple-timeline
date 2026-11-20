import {requestOptions} from './request-options'
import {randomUUID} from 'node:crypto'
import {environmentLoginErrors} from '../../shared/postrail-environment'
import {closeSync, constants, fstatSync, mkdirSync, openAsBlob, openSync} from 'node:fs'
import {basename, join} from 'node:path'
import {DatabaseSync, type SQLOutputValue} from 'node:sqlite'
import {postRailCopyName, type PrEnv, type PrEnvSave, type PrFile, type PrLibrary, type PrMutation, type PrRequest} from '../../shared/postrail'

export class PostRailStoreError extends Error {
  readonly name = 'PostRailStoreError'
}

interface PasswordProtector {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(ciphertext: Buffer): string
  getSelectedStorageBackend?(): string
}

export function canProtectPostRailPassword(protector: PasswordProtector): boolean {
  return protector.isEncryptionAvailable() &&
    !(process.platform === 'linux' && protector.getSelectedStorageBackend?.() === 'basic_text')
}

const schema = `
  CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
  CREATE TABLE requests (
    id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    definition TEXT NOT NULL, next_index TEXT NOT NULL DEFAULT '1'
  ) STRICT;
  CREATE TABLE environments (id TEXT PRIMARY KEY, definition TEXT NOT NULL, ciphertext BLOB) STRICT;
  CREATE TABLE selection (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL
  ) STRICT;
  INSERT INTO selection VALUES(1, NULL);
  PRAGMA user_version = 1;
`

function text(value: unknown): string {
  if (typeof value !== 'string') throw new PostRailStoreError('입력한 값을 확인하세요.')
  return value
}

function required(value: unknown): string {
  const trimmed = text(value).trim()
  if (!trimmed) throw new PostRailStoreError('이름과 필수 입력값을 확인하세요.')
  return trimmed
}

function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new PostRailStoreError('선택 항목을 확인하세요.')
  return value
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PostRailStoreError('이름과 값을 확인하세요.')
  const entries = Object.entries(value)
  if (entries.some(([key, item]) => !key.trim() || key !== key.trim() || typeof item !== 'string')) {
    throw new PostRailStoreError('이름과 값을 확인하세요.')
  }
  return Object.fromEntries(entries)
}

function requestDefinition(request: PrRequest) {
  const {method, timeoutMs} = request
  if (!['GET','POST','DELETE'].includes(method)) throw new PostRailStoreError('HTTP 메서드를 확인하세요.')
  if (timeoutMs !== null && (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)) {
    throw new PostRailStoreError('응답 대기 시간을 확인하세요.')
  }
  const options = requestOptions(request)
  const headers = options.headerRows
    ? Object.fromEntries(options.headerRows.filter(row => row.enabled).map(row => [row.name,row.value]))
    : stringMap(request.headers)
  return {
    ...options, name:required(request.name), method, url:required(request.url), headers,
    body:text(request.body), useAuth:bool(request.useAuth), timeoutMs, favorite:bool(request.favorite),
  }
}

function envDefinition(env: PrEnv) {
  const variables = stringMap(env.variables)
  if (Object.hasOwn(variables,'index') || Object.hasOwn(variables,'password')) {
    throw new PostRailStoreError('index와 password는 예약된 변수 이름입니다.')
  }
  return {
    name:required(env.name), variables, apiOrigin:text(env.apiOrigin), loginUrl:text(env.loginUrl),
    loginHeaders:stringMap(env.loginHeaders), loginBody:text(env.loginBody), tokenPath:text(env.tokenPath),
    tokenHeader:text(env.tokenHeader), tokenPrefix:text(env.tokenPrefix),
  }
}

type Row = Record<string, SQLOutputValue>

function readRequest(row: Row): PrRequest {
  return {...requestDefinition(JSON.parse(text(row.definition))), id:text(row.id),
    groupId:row.group_id === null ? null : text(row.group_id), nextIndex:decimal(row.next_index)}
}

function decimal(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) throw new PostRailStoreError('저장된 다음 번호를 읽을 수 없습니다.')
  return value
}

function requireRow(row: Row | undefined): Row {
  if (!row) throw new PostRailStoreError('저장된 항목을 찾을 수 없습니다.')
  return row
}

export class PostRailStore {
  private readonly db: DatabaseSync
  private readonly sessionPasswords = new Map<string, string>()

  private readonly pickedFiles = new Map<string, Map<string,string>>()

  constructor(profile: string, private readonly protector: PasswordProtector) {
    mkdirSync(profile, {recursive:true, mode:0o700})
    this.db = new DatabaseSync(join(profile, 'postrail.sqlite'))
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000')
      this.transaction('BEGIN IMMEDIATE', () => {
        const version = this.db.prepare('PRAGMA user_version').get()!.user_version
        if (version === 0) this.db.exec(schema)
        if (version === 0 || version === 1) {
          this.db.exec(`CREATE TABLE request_files (
            request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
            id TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (request_id,id)
          ) STRICT; PRAGMA user_version = 2;`)
        } else if (version !== 2) throw new PostRailStoreError('지원하지 않는 PostRail 저장 형식입니다.')
      })
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  private transaction<T>(begin: 'BEGIN' | 'BEGIN IMMEDIATE', apply: () => T): T {
    this.db.exec(begin)
    try {
      const result = apply()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw error
    }
  }

  read(): PrLibrary {
    return this.transaction('BEGIN', () => {
      const groups = this.db.prepare('SELECT * FROM groups ORDER BY rowid').all()
        .map(row => ({id:text(row.id),name:text(row.name)}))
      const requests = this.db.prepare('SELECT * FROM requests ORDER BY rowid').all().map(readRequest)
      const environments = this.db.prepare('SELECT id, definition, ciphertext IS NOT NULL AS protected FROM environments ORDER BY rowid').all()
        .map(row => ({
          ...envDefinition(JSON.parse(text(row.definition))), id:text(row.id),
          hasPassword:row.protected === 1 || this.sessionPasswords.has(text(row.id)),
        }))
      const selected = this.db.prepare('SELECT environment_id FROM selection WHERE singleton = 1').get()!.environment_id
      return {groups, requests, environments, environmentId:selected === null ? null : text(selected)}
    })
  }

  mutate(cmd: PrMutation): PrLibrary {
    const afterCommit = this.transaction('BEGIN IMMEDIATE', () => this.apply(cmd))
    afterCommit?.()
    return this.read()
  }

  private apply(cmd: PrMutation): (() => void) | undefined {
    switch (cmd.type) {
      case 'group.save': {
        const name = required(cmd.name)
        if (cmd.id === undefined || cmd.id === '') {
          this.db.prepare('INSERT INTO groups VALUES (?, ?)').run(randomUUID(), name)
        } else {
          requireRow(this.db.prepare('UPDATE groups SET name = ? WHERE id = ? RETURNING id').get(name, text(cmd.id)))
        }
        break
      }
      case 'group.delete':
        requireRow(this.db.prepare('DELETE FROM groups WHERE id = ? RETURNING id').get(text(cmd.id)))
        break
      case 'request.save':
        return this.saveRequest(cmd.request, cmd.request.id === '' ? cmd.copyFilesFrom : undefined)
      case 'request.content': {
        const current = this.storedRequest(cmd.request.id)
        const edited = {...cmd.request, name:current.name, groupId:current.groupId}
        // A metadata URL edit supersedes the editor's older address and its parameter rows.
        if (current.url !== text(cmd.baseUrl)) {
          edited.url = current.url
          edited.queryRows = current.queryRows
          edited.pathValues = current.pathValues
        }
        return this.saveRequest(edited)
      }
      case 'request.metadata': {
        const current = this.storedRequest(cmd.id)
        if (cmd.name !== undefined) current.name = cmd.name
        if (cmd.groupId !== undefined) current.groupId = cmd.groupId
        if (cmd.address !== undefined) {
          current.url = cmd.address.url
          current.queryRows = cmd.address.queryRows
          current.pathValues = cmd.address.pathValues
        }
        return this.saveRequest(current)
      }
      case 'request.move': {
        const groupId = cmd.groupId === null ? null : text(cmd.groupId)
        if (groupId !== null) requireRow(this.db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId))
        requireRow(this.db.prepare('UPDATE requests SET group_id = ? WHERE id = ? RETURNING id').get(groupId, text(cmd.id)))
        break
      }
      case 'request.favorite':
        requireRow(this.db.prepare("UPDATE requests SET definition = json_set(definition, '$.favorite', json(?)) WHERE id = ? RETURNING id")
          .get(JSON.stringify(bool(cmd.favorite)), text(cmd.id)))
        break
      case 'request.delete':
        requireRow(this.db.prepare('DELETE FROM requests WHERE id = ? RETURNING id').get(text(cmd.id)))
        return () => {this.pickedFiles.delete(cmd.id)}
      case 'request.duplicate': {
        const original = this.storedRequest(cmd.id)
        const names = this.db.prepare("SELECT json_extract(definition, '$.name') AS name FROM requests WHERE group_id IS ?")
          .all(cmd.groupId).map(row => text(row.name))
        this.saveRequest({...original, groupId:cmd.groupId, name:postRailCopyName(original.name, names), id:'', favorite:false},original.id)
        break
      }
      case 'env.batch': {
        if (!Array.isArray(cmd.saves) || !Array.isArray(cmd.deletedIds)) throw new PostRailStoreError('환경 변경 목록을 확인하세요.')
        const ids = [...cmd.deletedIds.map(required), ...cmd.saves.map(item => text(item.environment.id)).filter(Boolean)]
        if (new Set(ids).size !== ids.length) throw new PostRailStoreError('같은 환경에 중복 변경이 있습니다.')
        const committed: (() => void)[] = []
        for (const id of cmd.deletedIds) committed.push(this.deleteEnvironment(id))
        for (const save of cmd.saves) committed.push(this.saveEnvironment(save, false))
        this.db.exec('UPDATE selection SET environment_id = (SELECT id FROM environments ORDER BY rowid LIMIT 1) WHERE environment_id IS NULL')
        return () => {for (const update of committed) update()}
      }
      case 'env.save':
        return this.saveEnvironment(cmd)
      case 'env.delete': {
        const id = text(cmd.id)
        const committed = this.deleteEnvironment(id)
        this.db.exec('UPDATE selection SET environment_id = (SELECT id FROM environments ORDER BY rowid LIMIT 1) WHERE environment_id IS NULL')
        return committed
      }
      case 'env.select':
        requireRow(this.db.prepare('SELECT id FROM environments WHERE id = ?').get(text(cmd.id)))
        this.db.prepare('UPDATE selection SET environment_id = ? WHERE singleton = 1').run(cmd.id)
        break
      default:
        throw new PostRailStoreError('지원하지 않는 PostRail 변경입니다.')
    }
    return undefined
  }

  private storedRequest(id:string):PrRequest {
    return readRequest(requireRow(this.db.prepare('SELECT * FROM requests WHERE id = ?').get(text(id))))
  }

  private saveRequest(request: PrRequest, copyFrom?:string) {
    const definition = JSON.stringify(requestDefinition(request))
    const id = text(request.id)
    const groupId = request.groupId === null ? null : text(request.groupId)
    if (groupId !== null) requireRow(this.db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId))
    const destination = id || randomUUID()
    if (id === '') {
      this.db.prepare('INSERT INTO requests (id, group_id, definition) VALUES (?, ?, ?)').run(destination, groupId, definition)
    } else {
      // The sidebar owns the star; a stale editor snapshot cannot undo that change.
      requireRow(this.db.prepare("UPDATE requests SET group_id = ?, definition = json_set(?, '$.favorite', definition -> '$.favorite') WHERE id = ? RETURNING id")
        .get(groupId, definition, id))
    }
    const files=[request.binaryFile,...(request.parts ?? []).map(p=>p.file)].filter((f):f is PrFile=>!!f)
    const paths = new Map(files.map(f=>[f.id, this.filePath(copyFrom ?? id,f)]))
    this.db.prepare('DELETE FROM request_files WHERE request_id = ?').run(destination)
    const insert=this.db.prepare('INSERT INTO request_files (request_id,id,path) VALUES (?,?,?)')
    for (const [fileId,path] of paths) insert.run(destination,fileId,path)
    return () => {
      const pending = this.pickedFiles.get(destination)
      if (!pending) return
      for (const id of paths.keys()) pending.delete(id)
      if (!pending.size) this.pickedFiles.delete(destination)
    }
  }

  private requireFileOwner(id:string) {
    const owner = this.db.prepare('SELECT id FROM requests WHERE id = ?').get(id)
    if (!owner) this.pickedFiles.delete(id)
    requireRow(owner)
  }

  selectFile(requestId:string, path:string, retainedIds:string[]=[]):PrFile {
    this.requireFileOwner(requestId)
    // Keep picks still referenced in other draft slots, including inactive body modes.
    // Saved grants live in SQLite and are independent of the current editor draft.
    const retained = new Set(retainedIds)
    const pending = this.pickedFiles.get(requestId) ?? new Map<string,string>()
    for (const id of pending.keys()) {
      if (!retained.has(id)) pending.delete(id)
    }
    const id = randomUUID()
    pending.set(id,path)
    this.pickedFiles.set(requestId,pending)
    return {id,name:basename(path)}
  }

  private filePath(requestId:string, file:PrFile):string {
    this.requireFileOwner(requestId)
    const path=this.pickedFiles.get(requestId)?.get(file.id) ??
      this.db.prepare('SELECT path FROM request_files WHERE request_id = ? AND id = ?').get(requestId,file.id)?.path
    if (typeof path!=='string' || basename(path)!==file.name) throw new PostRailStoreError('요청의 첨부 파일을 다시 선택하세요.')
    return path
  }

  openFile(requestId:string, file:PrFile):()=>Promise<Blob> {
    const path=this.filePath(requestId,file)
    const fd = openSync(path,constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      if (!fstatSync(fd).isFile()) throw new PostRailStoreError('첨부 파일을 다시 선택하세요.')
    } finally {
      closeSync(fd)
    }
    return () => {
      this.requireFileOwner(requestId)
      return openAsBlob(path)
    }
  }

  private deleteEnvironment(id: string) {
    requireRow(this.db.prepare('DELETE FROM environments WHERE id = ? RETURNING id').get(id))
    return () => {this.sessionPasswords.delete(id)}
  }

  private saveEnvironment(cmd: PrEnvSave, selectNew = true) {
    const environment = envDefinition(cmd.environment)
    const error = Object.values(environmentLoginErrors(environment))[0]
    if (error) throw new PostRailStoreError(error)
    const definition = JSON.stringify(environment)
    const existingId = text(cmd.environment.id)
    const id = existingId || randomUUID()
    const old = existingId ? requireRow(this.db.prepare('SELECT ciphertext FROM environments WHERE id = ?').get(id)) : null
    if (cmd.password !== undefined) text(cmd.password)
    if (cmd.remember !== undefined) bool(cmd.remember)

    // Omitting both fields is an ordinary definition edit. It must work even with a locked keyring.
    let ciphertext = old?.ciphertext as Uint8Array | null ?? null
    let session = this.sessionPasswords.get(id)
    if (cmd.password !== undefined || cmd.remember !== undefined) {
      const password = cmd.password ?? this.unseal(id, ciphertext)
      const remember = cmd.remember ?? false
      ciphertext = password && remember ? this.seal(password) : null
      session = password && !remember ? password : undefined
    }
    this.db.prepare(`
      INSERT INTO environments (id, definition, ciphertext) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET definition = excluded.definition, ciphertext = excluded.ciphertext
    `).run(id, definition, ciphertext)
    if (selectNew && !existingId) this.db.prepare('UPDATE selection SET environment_id = ? WHERE singleton = 1').run(id)
    return () => {
      if (session === undefined) this.sessionPasswords.delete(id)
      else this.sessionPasswords.set(id, session)
    }
  }

  private seal(password: string): Buffer {
    try {
      if (!canProtectPostRailPassword(this.protector)) throw Error()
      return this.protector.encryptString(password)
    } catch {
      throw new PostRailStoreError('비밀번호를 보호하여 저장할 수 없습니다. 이 PC에 저장을 해제하면 현재 세션에서 사용할 수 있습니다.')
    }
  }

  private unseal(id: string, ciphertext: Uint8Array | null): string {
    if (!ciphertext) return this.sessionPasswords.get(id) ?? ''
    try {
      if (!canProtectPostRailPassword(this.protector)) throw Error()
      return this.protector.decryptString(Buffer.from(ciphertext))
    } catch {
      throw new PostRailStoreError('보호된 비밀번호를 열 수 없습니다. 비밀번호를 다시 입력하세요.')
    }
  }

  password(id: string): string {
    const row = requireRow(this.db.prepare('SELECT ciphertext FROM environments WHERE id = ?').get(text(id)))
    return this.unseal(id, row.ciphertext as Uint8Array | null)
  }

  reserveIndex(id: string): string {
    return this.transaction('BEGIN IMMEDIATE', () => {
      const row = requireRow(this.db.prepare('SELECT next_index FROM requests WHERE id = ?').get(text(id)))
      const index = decimal(row.next_index)
      this.db.prepare('UPDATE requests SET next_index = ? WHERE id = ?').run((BigInt(index) + 1n).toString(), id)
      return index
    })
  }

  close() {
    this.sessionPasswords.clear()
    this.pickedFiles.clear()
    if (this.db.isOpen) this.db.close()
  }
}
