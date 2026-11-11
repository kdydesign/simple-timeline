import type { DatabaseHandle } from './repository'
import { createSchema } from './schema'
import { addReminders } from './reminders'
import { addSharing } from './sharing/schema'
export interface Migration {
  version: number
  up(db: DatabaseHandle): void
}
export const migrations: Migration[] = [{ version: 1, up: createSchema }, { version: 2, up: addReminders }, { version: 3, up: addSharing }, { version: 4, up: db => db.exec("ALTER TABLE sharing_devices ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1) AND (deleted=0 OR revoked=1))") }]
