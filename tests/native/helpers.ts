import type { DatabaseHandle } from '../../src/main/db/repository'
import { openDatabase, createRepository } from '../../src/main/db/repository'
import { createSchema } from '../../src/main/db/schema'
import { join } from 'node:path'
export interface NativeContext {
  tempDir: string
  defer(cleanup: () => void): void
}
export interface NativeCase {
  name: string
  run(ctx: NativeContext): void | Promise<void>
}
export function setup(ctx: NativeContext) {
  const file = join(ctx.tempDir, 'timeline.sqlite3')
  const db: DatabaseHandle = openDatabase(file)
  ctx.defer(() => {
    if (db.open) db.close()
  })
  createSchema(db)
  return {
    db,
    file,
    repo: createRepository(db, () => '2026-11-03T00:00:00.000Z'),
  }
}
