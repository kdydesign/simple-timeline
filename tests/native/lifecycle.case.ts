import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { initializeStorage } from '../../src/main/db/lifecycle'
import { migrations } from '../../src/main/db/migrations'
import { openDatabase } from '../../src/main/db/repository'
import type { NativeCase } from './helpers'
const ready = async (
  ctx: Parameters<NativeCase['run']>[0],
  list = migrations,
) => {
  const s = await initializeStorage(ctx.tempDir, list)
  assert.equal(s.state, 'ready')
  if (s.state !== 'ready') throw Error('blocked')
  ctx.defer(() => {
    if (s.db.open) s.db.close()
  })
  return s
}
export const cases: NativeCase[] = [
  {
    name: 'creates only missing database and preserves rows across reopen',
    async run(ctx) {
      const a = await ready(ctx)
      a.repository.createProject({
        name: 'P',
        color: '#2563EB',
        participants: [],
      })
      a.db.close()
      const b = await ready(ctx)
      assert.equal(b.repository.getSnapshot().projects[0].name, 'P')
    },
  },
  {
    name: 'preserves existing zero-byte, corrupt, and foreign database files',
    async run(ctx) {
      const a = await ready(ctx)
      a.db.close()
      const file = join(ctx.tempDir, 'data', 'timeline.sqlite3')
      for (const data of [Buffer.alloc(0), Buffer.from('not sqlite')]) {
        writeFileSync(file, data)
        assert.equal((await initializeStorage(ctx.tempDir)).state, 'blocked')
        assert.deepEqual(readFileSync(file), data)
      }
      writeFileSync(file, Buffer.alloc(0))
      const foreign = openDatabase(file)
      foreign.exec('CREATE TABLE unrelated(a TEXT)')
      foreign.close()
      const before = readFileSync(file)
      assert.equal((await initializeStorage(ctx.tempDir)).state, 'blocked')
      assert.deepEqual(readFileSync(file), before)
    },
  },
  {
    name: 'backs up consistent version before upgrade and rejects newer databases',
    async run(ctx) {
      const a = await ready(ctx)
      a.db.close()
      const v2 = [
        ...migrations,
        {
          version: 2,
          up(db: ReturnType<typeof openDatabase>) {
            db.exec('CREATE TABLE extra(value TEXT)')
          },
        },
      ]
      const upgraded = await ready(ctx, v2)
      assert.equal(upgraded.db.pragma('user_version', { simple: true }), 2n)
      const backups = readdirSync(join(ctx.tempDir, 'migration-backups'))
      assert.equal(backups.filter((n) => n.endsWith('.sqlite3')).length, 1)
      const copy = openDatabase(
        join(ctx.tempDir, 'migration-backups', backups[0]),
        true,
      )
      assert.equal(copy.pragma('user_version', { simple: true }), 1n)
      copy.close()
      upgraded.db.close()
      const newer = await initializeStorage(ctx.tempDir)
      assert.equal(newer.state, 'blocked')
      if (newer.state === 'blocked')
        assert.equal(newer.error.code, 'SCHEMA_TOO_NEW')
    },
  },
  {
    name: 'rolls back failed migration and blocks when backup cannot complete',
    async run(ctx) {
      const a = await ready(ctx)
      a.db.close()
      const file = join(ctx.tempDir, 'data', 'timeline.sqlite3'),
        before = readFileSync(file)
      const v2 = [
        ...migrations,
        {
          version: 2,
          up(db: ReturnType<typeof openDatabase>) {
            db.exec('CREATE TABLE should_rollback(a TEXT)')
            throw Error('migration failed')
          },
        },
      ]
      const failed = await initializeStorage(ctx.tempDir, v2)
      assert.equal(failed.state, 'blocked')
      const check = openDatabase(file, true)
      assert.equal(check.pragma('user_version', { simple: true }), 1n)
      assert.equal(
        check
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='should_rollback'",
          )
          .get(),
        undefined,
      )
      check.close()
      const noBackup = await initializeStorage(ctx.tempDir, v2, {
        backup: async () => {
          throw Object.assign(Error('full'), { code: 'ENOSPC' })
        },
      })
      assert.equal(noBackup.state, 'blocked')
      if (noBackup.state === 'blocked')
        assert.equal(noBackup.error.code, 'STORAGE_FULL')
      assert.deepEqual(readFileSync(file), before)
    },
  },
  {
    name: 'blocks invalid foreign keys and profile I/O failure without overwriting',
    async run(ctx) {
      const a = await ready(ctx)
      a.db.pragma('foreign_keys=OFF')
      a.db.exec(
        "INSERT INTO schedules(project_id,name,start_date,end_date,created_at,updated_at) VALUES(999,'QA','2026-12-18','2026-12-18','t','t')",
      )
      a.db.close()
      const file = join(ctx.tempDir, 'data', 'timeline.sqlite3'),
        before = readFileSync(file)
      assert.equal((await initializeStorage(ctx.tempDir)).state, 'blocked')
      assert.deepEqual(readFileSync(file), before)
      const nonDirectory = join(ctx.tempDir, 'file')
      writeFileSync(nonDirectory, 'x')
      const invalid = await initializeStorage(nonDirectory)
      assert.equal(invalid.state, 'blocked')
    },
  },
]
