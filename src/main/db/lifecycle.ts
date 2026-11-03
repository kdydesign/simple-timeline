import Database from 'better-sqlite3'
import {
  mkdirSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
  renameSync,
  copyFileSync,
  constants,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  openDatabase,
  createRepository,
  type DatabaseHandle,
  type Repository,
} from './repository'
import { migrations, type Migration } from './migrations'
import { failure, toPublicError } from '../errors'
import type { ApiError } from '../../shared/types'
export type StorageState =
  | { state: 'ready'; db: DatabaseHandle; repository: Repository }
  | { state: 'blocked'; error: ApiError }
const APP_ID = 1398033486
function readApplicationHeader(file: string): Buffer {
  const fd = openSync(file, 'r'),
    header = Buffer.alloc(100)
  try {
    if (
      readSync(fd, header, 0, 100, 0) < 72 ||
      header.subarray(0, 16).toString() !== 'SQLite format 3\0'
    )
      throw failure('DB_CORRUPT')
    return header
  } finally {
    closeSync(fd)
  }
}
function inspect(file: string): { version: number } {
  readApplicationHeader(file)
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    if (db.pragma('application_id', { simple: true }) !== APP_ID)
      throw failure('DB_CORRUPT')
    if (
      !(db.pragma('quick_check') as { quick_check: string }[]).every(
        (r) => r.quick_check === 'ok',
      ) ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw failure('DB_CORRUPT')
    return { version: Number(db.pragma('user_version', { simple: true })) }
  } finally {
    db.close()
  }
}
export async function initializeStorage(
  profile: string,
  list: Migration[] = migrations,
  io = {
    backup: async (db: DatabaseHandle, dest: string) => {
      await db.backup(dest)
    },
  },
): Promise<StorageState> {
  let db: DatabaseHandle | undefined
  try {
    if (!list.length || list.some((m, i) => m.version !== i + 1))
      throw failure('DB_NOT_READY')
    const dir = join(profile, 'data'),
      file = join(dir, 'timeline.sqlite3')
    mkdirSync(dir, { recursive: true })
    const existed = existsSync(file),
      target = list.at(-1)!.version
    let version = 0
    if (existed) {
      const header = readApplicationHeader(file)
      if (header.readUInt32BE(68) !== APP_ID) throw failure('DB_CORRUPT')
      if (existsSync(file + '-journal')) {
        // A readonly connection cannot recover a hot rollback journal. Preserve
        // the recognized application's raw pair before allowing SQLite recovery.
        const root = join(
          profile,
          'recovery-backups',
          `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`,
        )
        mkdirSync(root, { recursive: true })
        for (const suffix of ['', '-journal', '-wal', '-shm'])
          if (existsSync(file + suffix))
            copyFileSync(
              file + suffix,
              join(root, 'timeline.sqlite3' + suffix),
              constants.COPYFILE_EXCL,
            )
        console.info('Preserved SQLite recovery files:', root)
        db = openDatabase(file, true)
      }
      version = inspect(file).version
    }
    if (existed && version < 1) throw failure('DB_CORRUPT')
    if (version > target) throw failure('SCHEMA_TOO_NEW')
    db ??= openDatabase(file, existed)
    if (existed && version < target) {
      const backupDir = join(profile, 'migration-backups')
      mkdirSync(backupDir, { recursive: true })
      const name = `v${version}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite3`,
        dest = join(backupDir, name + '.partial')
      closeSync(openSync(dest, 'wx'))
      await io.backup(db, dest)
      if (inspect(dest).version !== version) throw failure('DB_CORRUPT')
      renameSync(dest, join(backupDir, name))
    }
    for (const m of list.filter((m) => m.version > version)) {
      const handle = db
      handle.transaction(() => {
        m.up(handle)
        handle.pragma(`application_id=${APP_ID}`)
        handle.pragma(`user_version=${m.version}`)
      })()
    }
    return { state: 'ready', db, repository: createRepository(db) }
  } catch (error) {
    if (db?.open) db.close()
    return { state: 'blocked', error: toPublicError(error) }
  }
}
